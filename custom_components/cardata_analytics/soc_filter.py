"""SoC spike filtering helpers for Cardata Analytics.

The live guard is intentionally conservative: it only suppresses a large,
short-lived upward excursion when the source quickly returns to the real
driving trend. The return may be below the exact pre-spike value because the
vehicle can continue consuming energy while the bad sample is present.
Historical repair applies the same directional zig-zag idea to upward and
downward excursions and always presents a preview before stored analytics are
changed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import math
from typing import Any

SOC_SPIKE_MIN_JUMP_PP = 18.0
SOC_SPIKE_RETURN_TOLERANCE_PP = 12.0
SOC_SPIKE_DIRECTIONAL_RETURN_TOLERANCE_PP = 8.0
SOC_SPIKE_NO_MILEAGE_RETURN_TOLERANCE_PP = 6.0
SOC_SPIKE_WINDOW = timedelta(minutes=45)
# A short zig-zag is allowed to return below (up-spike) or above (down-spike)
# the pre-spike baseline. This matters while a vehicle is genuinely consuming
# energy during a bad source sample, e.g. 67 -> 100 -> 54.
SOC_SPIKE_HARD_WINDOW = timedelta(minutes=30)
SOC_SPIKE_NO_MILEAGE_WINDOW = timedelta(minutes=20)
SOC_SPIKE_STATIONARY_KM = 1.5


@dataclass(slots=True, frozen=True)
class SocSample:
    """One historical SoC sample with the latest known odometer value."""

    when: datetime
    soc: float
    mileage: float | None = None


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _parse_when(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
        return parsed
    return None


def _stationary_enough(
    baseline_mileage: float | None,
    current_mileage: float | None,
) -> bool | None:
    """Return True/False when odometer evidence exists, otherwise None."""
    if baseline_mileage is None or current_mileage is None:
        return None
    return abs(current_mileage - baseline_mileage) <= SOC_SPIKE_STATIONARY_KM


def initial_live_guard(
    soc: float | None,
    when: datetime,
    mileage: float | None,
    stored: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a validated persisted live SoC guard state."""
    guard: dict[str, Any] = {}
    if isinstance(stored, dict):
        accepted_soc = _finite(stored.get("accepted_soc"))
        accepted_at = _parse_when(stored.get("accepted_at"))
        accepted_mileage = _finite(stored.get("accepted_mileage"))
        if accepted_soc is not None and 0 <= accepted_soc <= 100 and accepted_at is not None:
            guard = {
                "accepted_soc": accepted_soc,
                "accepted_at": accepted_at.isoformat(),
                "accepted_mileage": accepted_mileage,
                "pending_high": None,
            }
            pending = stored.get("pending_high")
            if isinstance(pending, dict):
                started_at = _parse_when(pending.get("started_at"))
                base_soc = _finite(pending.get("baseline_soc"))
                last_soc = _finite(pending.get("last_soc"))
                if (
                    started_at is not None
                    and base_soc is not None
                    and last_soc is not None
                    and 0 <= base_soc <= 100
                    and 0 <= last_soc <= 100
                ):
                    guard["pending_high"] = {
                        "started_at": started_at.isoformat(),
                        "baseline_soc": base_soc,
                        "baseline_mileage": _finite(pending.get("baseline_mileage")),
                        "last_soc": last_soc,
                    }

    if not guard:
        if soc is None or not math.isfinite(soc) or not 0 <= soc <= 100:
            return {
                "accepted_soc": None,
                "accepted_at": when.isoformat(),
                "accepted_mileage": mileage,
                "pending_high": None,
            }
        return {
            "accepted_soc": float(soc),
            "accepted_at": when.isoformat(),
            "accepted_mileage": mileage,
            "pending_high": None,
        }

    # A very old persisted guard is less trustworthy than the current source.
    accepted_at = _parse_when(guard.get("accepted_at"))
    if (
        soc is not None
        and accepted_at is not None
        and when - accepted_at > timedelta(hours=6)
        and 0 <= soc <= 100
    ):
        guard = {
            "accepted_soc": float(soc),
            "accepted_at": when.isoformat(),
            "accepted_mileage": mileage,
            "pending_high": None,
        }
    return guard


def process_live_soc(
    guard: dict[str, Any],
    soc: float,
    when: datetime,
    mileage: float | None,
) -> tuple[dict[str, Any], float, dict[str, Any] | None]:
    """Process one live raw SoC state.

    Returns ``(guard, consumed_percentage_points, rejected_spike)``. Only large
    upward excursions are held back live because that is the failure mode that
    inflates Cardata energy when the source immediately falls back. Historical
    repair handles both directions with an explicit user preview.
    """
    if not math.isfinite(soc) or not 0 <= soc <= 100:
        return guard, 0.0, None

    accepted = _finite(guard.get("accepted_soc"))
    accepted_at = _parse_when(guard.get("accepted_at")) or when
    accepted_mileage = _finite(guard.get("accepted_mileage"))
    pending = guard.get("pending_high") if isinstance(guard.get("pending_high"), dict) else None

    if accepted is None:
        guard.update(
            accepted_soc=float(soc),
            accepted_at=when.isoformat(),
            accepted_mileage=mileage,
            pending_high=None,
        )
        return guard, 0.0, None

    if pending:
        started_at = _parse_when(pending.get("started_at")) or accepted_at
        baseline_soc = _finite(pending.get("baseline_soc"))
        baseline_mileage = _finite(pending.get("baseline_mileage"))
        last_high = _finite(pending.get("last_soc"))
        baseline_soc = accepted if baseline_soc is None else baseline_soc
        last_high = accepted if last_high is None else last_high
        age = when - started_at
        stationary = _stationary_enough(baseline_mileage, mileage)
        hard_short = age <= SOC_SPIKE_HARD_WINDOW
        tolerance = (
            SOC_SPIKE_RETURN_TOLERANCE_PP
            if stationary is not None or hard_short
            else SOC_SPIKE_NO_MILEAGE_RETURN_TOLERANCE_PP
        )
        window = SOC_SPIKE_WINDOW if stationary is not None else SOC_SPIKE_NO_MILEAGE_WINDOW

        # Directional return is deliberately asymmetric: after a false high
        # sample the real vehicle may keep consuming energy, so the first valid
        # value can be well *below* the pre-spike baseline. Requiring an
        # absolute return near the baseline missed exactly those moving-vehicle
        # zig-zags (67 -> 100 -> 54). The inverse applies to false low samples
        # in historical repair.
        returned = soc <= baseline_soc + (
            SOC_SPIKE_DIRECTIONAL_RETURN_TOLERANCE_PP if hard_short else tolerance
        )
        if returned and (hard_short or (age <= window and stationary is not False)):
            consumed = max(0.0, baseline_soc - soc)
            rejected = {
                "direction": "up",
                "baseline_soc": baseline_soc,
                "peak_soc": last_high,
                "return_soc": soc,
                "started_at": started_at.isoformat(),
                "ended_at": when.isoformat(),
                "mileage_delta_km": (
                    abs(mileage - baseline_mileage)
                    if mileage is not None and baseline_mileage is not None
                    else None
                ),
            }
            guard.update(
                accepted_soc=float(soc),
                accepted_at=when.isoformat(),
                accepted_mileage=mileage,
                pending_high=None,
            )
            return guard, consumed, rejected

        # As long as the raw source remains far above the stable baseline within
        # the short window, keep waiting instead of letting it become a false
        # consumption baseline.
        if (hard_short or (age <= window and stationary is not False)) and soc > baseline_soc + tolerance:
            pending["last_soc"] = float(soc)
            guard["pending_high"] = pending
            return guard, 0.0, None

        # The excursion persisted long enough or the odometer proves movement.
        # Treat the high value as real and resume normal monotonic accounting.
        consumed = max(0.0, last_high - soc)
        guard.update(
            accepted_soc=float(soc),
            accepted_at=when.isoformat(),
            accepted_mileage=mileage,
            pending_high=None,
        )
        return guard, consumed, None

    gap = when - accepted_at
    stationary = _stationary_enough(accepted_mileage, mileage)
    short_window = SOC_SPIKE_WINDOW if stationary is not None else SOC_SPIKE_NO_MILEAGE_WINDOW
    if (
        soc - accepted >= SOC_SPIKE_MIN_JUMP_PP
        and (
            gap <= SOC_SPIKE_HARD_WINDOW
            # A large upward SoC jump while the odometer has advanced cannot be
            # normal charging. Hold it as a candidate even if the previous SoC
            # state itself is older than the hard window.
            or stationary is False
            or (gap <= short_window and stationary is not False)
        )
    ):
        guard["pending_high"] = {
            "started_at": when.isoformat(),
            "baseline_soc": accepted,
            "baseline_mileage": accepted_mileage,
            "last_soc": float(soc),
        }
        return guard, 0.0, None

    consumed = max(0.0, accepted - soc)
    guard.update(
        accepted_soc=float(soc),
        accepted_at=when.isoformat(),
        accepted_mileage=mileage,
        pending_high=None,
    )
    return guard, consumed, None


def filter_historical_soc(
    samples: list[SocSample],
) -> tuple[list[SocSample], list[dict[str, Any]]]:
    """Remove short-lived SoC zig-zags while preserving genuine trends.

    The important invariant is directional rather than symmetric. For an
    upward candidate the source only has to return to or below the stable
    pre-spike corridor; it may be substantially lower because the car can keep
    driving while the bad sample is present. The inverse applies to a downward
    candidate. This detects patterns such as ``67 -> 100 -> 54`` and repeated
    pulses without mistaking normal monotonic driving/charging for a spike.

    Very short round trips are accepted regardless of odometer movement. For
    the wider fallback window we retain the conservative odometer/stability
    checks from v0.1.63.
    """
    cleaned: list[SocSample] = []
    spikes: list[dict[str, Any]] = []
    ordered = [s for s in sorted(samples, key=lambda item: item.when) if 0 <= s.soc <= 100]
    if not ordered:
        return cleaned, spikes

    i = 0
    cleaned.append(ordered[0])
    while i < len(ordered) - 1:
        baseline = cleaned[-1]
        candidate = ordered[i + 1]
        jump = candidate.soc - baseline.soc
        if abs(jump) < SOC_SPIKE_MIN_JUMP_PP:
            cleaned.append(candidate)
            i += 1
            continue

        direction = 1 if jump > 0 else -1
        return_index: int | None = None
        extreme = candidate
        for j in range(i + 2, len(ordered)):
            current = ordered[j]
            age = current.when - candidate.when
            if age > SOC_SPIKE_WINDOW:
                break

            if direction > 0 and current.soc > extreme.soc:
                extreme = current
            elif direction < 0 and current.soc < extreme.soc:
                extreme = current

            hard_short = age <= SOC_SPIKE_HARD_WINDOW
            stationary_return = _stationary_enough(baseline.mileage, current.mileage)

            if direction > 0:
                directional_return = (
                    current.soc
                    <= baseline.soc + SOC_SPIKE_DIRECTIONAL_RETURN_TOLERANCE_PP
                )
            else:
                directional_return = (
                    current.soc
                    >= baseline.soc - SOC_SPIKE_DIRECTIONAL_RETURN_TOLERANCE_PP
                )

            near_baseline = abs(current.soc - baseline.soc) <= SOC_SPIKE_RETURN_TOLERANCE_PP

            if hard_short and directional_return:
                return_index = j
                break
            if (
                stationary_return is not False
                and (directional_return or near_baseline)
                and age <= SOC_SPIKE_WINDOW
            ):
                return_index = j
                break

            if not hard_short and stationary_return is False:
                break

        if return_index is None:
            cleaned.append(candidate)
            i += 1
            continue

        returned = ordered[return_index]
        excursion = ordered[i + 1 : return_index]
        if excursion:
            spikes.append(
                {
                    "direction": "up" if direction > 0 else "down",
                    "baseline_soc": round(baseline.soc, 3),
                    "extreme_soc": round(extreme.soc, 3),
                    "return_soc": round(returned.soc, 3),
                    "started_at": candidate.when.isoformat(),
                    "ended_at": returned.when.isoformat(),
                    "ignored_samples": len(excursion),
                    "mileage_delta_km": (
                        round(abs(returned.mileage - baseline.mileage), 3)
                        if returned.mileage is not None and baseline.mileage is not None
                        else None
                    ),
                }
            )
        cleaned.append(returned)
        i = return_index

    return cleaned, spikes
