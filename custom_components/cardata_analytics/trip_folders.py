"""Persist trip identities and optional nested folders next to GPS track points."""
from __future__ import annotations

from uuid import uuid4


class TripFoldersMixin:
    def _init_trip_folders_db(self):
        with self._connect() as con:
            con.executescript("""
                CREATE TABLE IF NOT EXISTS trip_folders (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES trip_folders(id),
                    position INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS trip_identity (
                    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, anchor_point_id INTEGER NOT NULL UNIQUE
                );
                CREATE TABLE IF NOT EXISTS trip_membership (
                    folder_id TEXT NOT NULL REFERENCES trip_folders(id) ON DELETE CASCADE,
                    trip_id TEXT NOT NULL REFERENCES trip_identity(id) ON DELETE CASCADE,
                    PRIMARY KEY(folder_id, trip_id)
                );
                CREATE TABLE IF NOT EXISTS trip_groups (
                    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS trip_group_members (
                    group_id TEXT NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
                    trip_id TEXT NOT NULL UNIQUE REFERENCES trip_identity(id) ON DELETE CASCADE,
                    PRIMARY KEY(group_id, trip_id)
                );
            """)
            if "position" not in {r[1] for r in con.execute("PRAGMA table_info(trip_folders)")}:
                con.execute("ALTER TABLE trip_folders ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
                rows = con.execute("SELECT id, parent_id FROM trip_folders ORDER BY name COLLATE NOCASE, id").fetchall()
                positions = {}
                for row in rows:
                    parent = row["parent_id"]
                    positions[parent] = positions.get(parent, 0) + 1
                    con.execute("UPDATE trip_folders SET position=? WHERE id=?", (positions[parent], row["id"]))

    def _trip_groups_db(self, entry_id):
        with self._connect() as con:
            rows = con.execute(
                "SELECT m.trip_id, m.group_id FROM trip_group_members m JOIN trip_groups g ON g.id=m.group_id WHERE g.vehicle_id=?",
                (entry_id,)).fetchall()
            counts = {}
            for row in rows:
                counts[row["group_id"]] = counts.get(row["group_id"], 0) + 1
            return {row["trip_id"]: row["group_id"] for row in rows}, counts

    @staticmethod
    def _clean_empty_groups(con):
        con.execute("DELETE FROM trip_groups WHERE id IN (SELECT g.id FROM trip_groups g LEFT JOIN trip_group_members m ON m.group_id=g.id GROUP BY g.id HAVING COUNT(m.trip_id)<2)")

    def _unmerge_trip_db(self, vehicle_id, group_id):
        with self._connect() as con:
            con.execute("PRAGMA foreign_keys=ON")
            if not con.execute("DELETE FROM trip_groups WHERE id=? AND vehicle_id=?", (group_id, vehicle_id)).rowcount:
                raise ValueError("Unknown merged trip")
        return {"trips": 1}

    def _validated_group_ranges(self, vehicle_id, group_id, members):
        if not group_id or not 2 <= len(members) <= 300:
            raise ValueError("Select a complete merged trip")
        with self._connect() as con:
            ids = {r[0] for r in con.execute(
                "SELECT m.trip_id FROM trip_group_members m JOIN trip_groups g ON g.id=m.group_id WHERE g.id=? AND g.vehicle_id=?",
                (group_id, vehicle_id))}
            if ids != {m["id"] for m in members} or len(ids) != len(members):
                raise ValueError("Merged trip has changed; refresh the list")
            return [(m, self._validated_trip_ids(con, vehicle_id, m["id"], m["start_ts"], m["end_ts"])) for m in members]

    def _folder_db(self):
        with self._connect() as con:
            rows = [dict(r) for r in con.execute("SELECT id, name, parent_id, position FROM trip_folders ORDER BY position, name COLLATE NOCASE, id")]
            children = {}
            for row in rows:
                children.setdefault(row["parent_id"], []).append(row)
            ordered = []
            def visit(parent):
                for child in children.get(parent, []):
                    ordered.append(child)
                    visit(child["id"])
            visit(None)
            return ordered

    def _folder_action_db(self, action, data):
        with self._connect() as con:
            con.execute("PRAGMA foreign_keys=ON")
            if action in {"save", "reorder"}:
                con.execute("BEGIN IMMEDIATE")
            if action == "save":
                name = str(data.get("name", "")).strip()
                parent = data.get("parent_id") or None
                folder_id = data.get("folder_id") or uuid4().hex
                if not name or len(name) > 100 or (parent and not con.execute("SELECT 1 FROM trip_folders WHERE id=?", (parent,)).fetchone()):
                    raise ValueError("Invalid folder name or parent")
                if folder_id == parent:
                    raise ValueError("A folder cannot contain itself")
                if data.get("folder_id"):
                    existing = con.execute("SELECT parent_id FROM trip_folders WHERE id=?", (folder_id,)).fetchone()
                    if not existing:
                        raise ValueError("Unknown folder")
                    ancestor = parent
                    while ancestor:
                        if ancestor == folder_id:
                            raise ValueError("Folders cannot form a cycle")
                        row = con.execute("SELECT parent_id FROM trip_folders WHERE id=?", (ancestor,)).fetchone()
                        ancestor = row[0] if row else None
                    if existing["parent_id"] != parent:
                        position = con.execute("SELECT COALESCE(MAX(position),0)+1 FROM trip_folders WHERE parent_id IS ?", (parent,)).fetchone()[0]
                        con.execute("UPDATE trip_folders SET name=?, parent_id=?, position=? WHERE id=?", (name, parent, position, folder_id))
                    else:
                        con.execute("UPDATE trip_folders SET name=? WHERE id=?", (name, folder_id))
                else:
                    position = con.execute("SELECT COALESCE(MAX(position),0)+1 FROM trip_folders WHERE parent_id IS ?", (parent,)).fetchone()[0]
                    con.execute("INSERT INTO trip_folders (id,name,parent_id,position) VALUES (?,?,?,?)", (folder_id, name, parent, position))
                return {"folder_id": folder_id}
            if action == "reorder":
                folder_id, direction = data.get("folder_id"), data.get("direction")
                if direction not in {"up", "down"}:
                    raise ValueError("Invalid folder direction")
                folder = con.execute("SELECT id,parent_id FROM trip_folders WHERE id=?", (folder_id,)).fetchone()
                if not folder:
                    raise ValueError("Unknown folder")
                siblings = [r["id"] for r in con.execute(
                    "SELECT id FROM trip_folders WHERE parent_id IS ? ORDER BY position, name COLLATE NOCASE, id", (folder["parent_id"],))]
                index = siblings.index(folder_id)
                other = index + (-1 if direction == "up" else 1)
                if not 0 <= other < len(siblings):
                    return {}
                # Normalizing sibling positions also fixes duplicate positions in old databases.
                siblings[index], siblings[other] = siblings[other], siblings[index]
                for pos, sibling_id in enumerate(siblings, 1):
                    con.execute("UPDATE trip_folders SET position=? WHERE id=?", (pos, sibling_id))
                return {}
            if action == "delete":
                folder_id = data.get("folder_id")
                if con.execute("SELECT 1 FROM trip_folders WHERE parent_id=?", (folder_id,)).fetchone():
                    raise ValueError("Move or delete subfolders first")
                con.execute("DELETE FROM trip_membership WHERE folder_id=?", (folder_id,))
                if not con.execute("DELETE FROM trip_folders WHERE id=?", (folder_id,)).rowcount:
                    raise ValueError("Unknown folder")
                return {}
            if action in {"assign", "unassign"}:
                folder_id, trip_id = data.get("folder_id"), data.get("trip_id")
                if not con.execute("SELECT 1 FROM trip_folders WHERE id=?", (folder_id,)).fetchone():
                    raise ValueError("Unknown folder")
                if not con.execute("SELECT 1 FROM trip_identity WHERE id=?", (trip_id,)).fetchone():
                    raise ValueError("Unknown trip")
                if action == "assign":
                    con.execute("INSERT OR IGNORE INTO trip_membership VALUES (?,?)", (folder_id, trip_id))
                else:
                    con.execute("DELETE FROM trip_membership WHERE folder_id=? AND trip_id=?", (folder_id, trip_id))
                return {}
            raise ValueError("Unknown folder action")

    def _trip_metadata_db(self, entry_id, segments):
        """Find prior anchors anywhere in each segment so imports do not rename a trip."""
        metadata = []
        with self._connect() as con:
            known = {r["anchor_point_id"]: r["id"] for r in con.execute("SELECT anchor_point_id, id FROM trip_identity WHERE vehicle_id=?", (entry_id,))}
            for segment in segments:
                if len(segment) < 2:
                    metadata.append(None)
                    continue
                ids = [point.db_id for point in segment]
                if not all(ids):
                    metadata.append(None)
                    continue
                # An imported prefix can extend a trip while its old anchor survives.
                trip_id = next((known[point_id] for point_id in ids if point_id in known), None)
                if trip_id is None:
                    trip_id = uuid4().hex
                    con.execute("INSERT INTO trip_identity VALUES (?,?,?)", (trip_id, entry_id, ids[0]))
                    known[ids[0]] = trip_id
                folders = [r[0] for r in con.execute("SELECT folder_id FROM trip_membership WHERE trip_id=?", (trip_id,))]
                metadata.append({"id": trip_id, "folders": folders})
        return metadata

    def _validated_trip_ids(self, con, vehicle_id, trip_id, start_ts, end_ts):
        record = con.execute("SELECT anchor_point_id FROM trip_identity WHERE id=? AND vehicle_id=?", (trip_id, vehicle_id)).fetchone()
        if not record:
            raise ValueError("Unknown trip")
        rows = con.execute("SELECT * FROM track_points WHERE vehicle_id=? AND ts>=? AND ts<=? ORDER BY ts, id", (vehicle_id, start_ts, end_ts)).fetchall()
        if len(rows) < 2 or abs(rows[0]["ts"] - start_ts) > .001 or abs(rows[-1]["ts"] - end_ts) > .001:
            raise ValueError("Trip has changed; refresh the list")
        points = [self._row_point(r) for r in rows]
        if len(self._split_segments(points)) != 1 or record["anchor_point_id"] not in [p.db_id for p in points]:
            raise ValueError("Trip has changed; refresh the list")
        previous = con.execute("SELECT * FROM track_points WHERE vehicle_id=? AND (ts<? OR (ts=? AND id<?)) ORDER BY ts DESC, id DESC LIMIT 1", (vehicle_id, start_ts, start_ts, points[0].db_id)).fetchone()
        following = con.execute("SELECT * FROM track_points WHERE vehicle_id=? AND (ts>? OR (ts=? AND id>?)) ORDER BY ts, id LIMIT 1", (vehicle_id, end_ts, end_ts, points[-1].db_id)).fetchone()
        if previous and len(self._split_segments([self._row_point(previous),points[0]])) == 1:
            raise ValueError("Trip has changed; refresh the list")
        if following and len(self._split_segments([points[-1],self._row_point(following)])) == 1:
            raise ValueError("Trip has changed; refresh the list")
        return [p.db_id for p in points]

    def _batch_trip_action_db(self, action, trips, folder_id=None):
        if action not in {"delete", "move", "merge"} or not 1 <= len(trips) <= 300 or (action == "merge" and len(trips) < 2):
            raise ValueError("Select between 1 and 300 trips")
        keys = [(t["entry_id"],t["trip_id"]) for t in trips]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate trips in selection")
        with self._connect() as con:
            con.execute("PRAGMA foreign_keys=ON")
            con.execute("BEGIN IMMEDIATE")
            if action == "move" and folder_id and not con.execute("SELECT 1 FROM trip_folders WHERE id=?",(folder_id,)).fetchone():
                raise ValueError("Unknown folder")
            validated = []
            for t in trips:
                vehicle_id, trip_id = t["entry_id"], t["trip_id"]
                validated.append((vehicle_id,trip_id,self._validated_trip_ids(con,vehicle_id,trip_id,t["start_ts"],t["end_ts"])))
            if action == "merge":
                if len({vehicle_id for vehicle_id, _, _ in validated}) != 1:
                    raise ValueError("Only trips from the same vehicle can be merged")
                placeholders = ",".join("?" for _ in validated)
                selected_ids = [trip_id for _, trip_id, _ in validated]
                existing = [r[0] for r in con.execute(
                    f"SELECT DISTINCT group_id FROM trip_group_members WHERE trip_id IN ({placeholders})", selected_ids)]
                for group_id in existing:
                    group_members = {r[0] for r in con.execute("SELECT trip_id FROM trip_group_members WHERE group_id=?", (group_id,))}
                    if not group_members.issubset(selected_ids):
                        raise ValueError("Select all parts of an existing merged trip")
                group_id = existing[0] if existing else uuid4().hex
                for old_id in existing:
                    con.execute("DELETE FROM trip_group_members WHERE group_id=?", (old_id,))
                    if old_id != group_id:
                        con.execute("DELETE FROM trip_groups WHERE id=?", (old_id,))
                if not existing:
                    con.execute("INSERT INTO trip_groups VALUES (?,?)", (group_id, validated[0][0]))
                con.executemany("INSERT INTO trip_group_members VALUES (?,?)", ((group_id, trip_id) for trip_id in selected_ids))
                return {"trips":len(validated), "group_id":group_id}
            if action == "delete":
                for vehicle_id, trip_id, point_ids in validated:
                    for offset in range(0,len(point_ids),500):
                        batch=point_ids[offset:offset+500]
                        con.execute(f"DELETE FROM track_points WHERE vehicle_id=? AND id IN ({','.join('?' for _ in batch)})", (vehicle_id,*batch))
                    con.execute("DELETE FROM trip_membership WHERE trip_id=?",(trip_id,))
                    con.execute("DELETE FROM trip_identity WHERE id=?",(trip_id,))
                self._clean_empty_groups(con)
            else:
                for _, trip_id, _ in validated:
                    con.execute("DELETE FROM trip_membership WHERE trip_id=?",(trip_id,))
                    if folder_id:
                        con.execute("INSERT INTO trip_membership VALUES (?,?)",(folder_id,trip_id))
            return {"trips":len(validated),"deleted":sum(len(ids) for _,_,ids in validated) if action == "delete" else 0}

    def _delete_trip_db(self, vehicle_id, trip_id, start_ts, end_ts):
        result = self._batch_trip_action_db("delete", [{"entry_id":vehicle_id,"trip_id":trip_id,"start_ts":start_ts,"end_ts":end_ts}])
        return result["deleted"]

    def _clean_trip_metadata_db(self, entry_ids):
        with self._connect() as con:
            con.execute("PRAGMA foreign_keys=ON")
            for vehicle_id in entry_ids:
                ids = [r[0] for r in con.execute("SELECT id FROM trip_identity WHERE vehicle_id=? AND anchor_point_id NOT IN (SELECT id FROM track_points WHERE vehicle_id=?)", (vehicle_id, vehicle_id))]
                for trip_id in ids:
                    con.execute("DELETE FROM trip_membership WHERE trip_id=?", (trip_id,))
                    con.execute("DELETE FROM trip_identity WHERE id=?", (trip_id,))
            self._clean_empty_groups(con)
