"""Persist trip identities and optional nested folders next to GPS track points."""
from __future__ import annotations

from uuid import uuid4


class TripFoldersMixin:
    def _init_trip_folders_db(self):
        with self._connect() as con:
            con.executescript("""
                CREATE TABLE IF NOT EXISTS trip_folders (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES trip_folders(id)
                );
                CREATE TABLE IF NOT EXISTS trip_identity (
                    id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, anchor_point_id INTEGER NOT NULL UNIQUE
                );
                CREATE TABLE IF NOT EXISTS trip_membership (
                    folder_id TEXT NOT NULL REFERENCES trip_folders(id) ON DELETE CASCADE,
                    trip_id TEXT NOT NULL REFERENCES trip_identity(id) ON DELETE CASCADE,
                    PRIMARY KEY(folder_id, trip_id)
                );
            """)

    def _folder_db(self):
        with self._connect() as con:
            return [{"id": r["id"], "name": r["name"], "parent_id": r["parent_id"]}
                    for r in con.execute("SELECT * FROM trip_folders ORDER BY name COLLATE NOCASE")]

    def _folder_action_db(self, action, data):
        with self._connect() as con:
            con.execute("PRAGMA foreign_keys=ON")
            if action == "save":
                name = str(data.get("name", "")).strip()
                parent = data.get("parent_id") or None
                folder_id = data.get("folder_id") or uuid4().hex
                if not name or len(name) > 100 or (parent and not con.execute("SELECT 1 FROM trip_folders WHERE id=?", (parent,)).fetchone()):
                    raise ValueError("Invalid folder name or parent")
                if folder_id == parent:
                    raise ValueError("A folder cannot contain itself")
                if data.get("folder_id"):
                    if not con.execute("SELECT 1 FROM trip_folders WHERE id=?", (folder_id,)).fetchone():
                        raise ValueError("Unknown folder")
                    ancestor = parent
                    while ancestor:
                        if ancestor == folder_id:
                            raise ValueError("Folders cannot form a cycle")
                        row = con.execute("SELECT parent_id FROM trip_folders WHERE id=?", (ancestor,)).fetchone()
                        ancestor = row[0] if row else None
                    con.execute("UPDATE trip_folders SET name=?, parent_id=? WHERE id=?", (name, parent, folder_id))
                else:
                    con.execute("INSERT INTO trip_folders VALUES (?,?,?)", (folder_id, name, parent))
                return {"folder_id": folder_id}
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
        if action not in {"delete", "move"} or not 1 <= len(trips) <= 300:
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
            if action == "delete":
                for vehicle_id, trip_id, point_ids in validated:
                    for offset in range(0,len(point_ids),500):
                        batch=point_ids[offset:offset+500]
                        con.execute(f"DELETE FROM track_points WHERE vehicle_id=? AND id IN ({','.join('?' for _ in batch)})", (vehicle_id,*batch))
                    con.execute("DELETE FROM trip_membership WHERE trip_id=?",(trip_id,))
                    con.execute("DELETE FROM trip_identity WHERE id=?",(trip_id,))
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
