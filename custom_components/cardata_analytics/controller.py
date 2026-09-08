"""Shared comparison-period controller for Cardata Analytics."""

from __future__ import annotations

import asyncio
import calendar
from datetime import date, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    RANGE_PRESET_CUSTOM,
    RANGE_PRESET_TODAY,
    RANGE_PRESET_LAST_7_DAYS,
    RANGE_PRESET_LAST_DAY,
    RANGE_PRESET_LAST_MONTH,
    RANGE_PRESET_LAST_YEAR,
    RANGE_PRESET_OPTIONS,
    SIGNAL_GLOBAL_RANGE_UPDATE,
)


def _parse_date(value: Any, fallback: date) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    return fallback


def _previous_month(value: date) -> date:
    """Return the same day in the previous month, clamped to month end."""
    year = value.year
    month = value.month - 1
    if month == 0:
        month = 12
        year -= 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _previous_year(value: date) -> date:
    """Return the same day in the previous year, clamped for leap day."""
    day = min(value.day, calendar.monthrange(value.year - 1, value.month)[1])
    return date(value.year - 1, value.month, day)


class GlobalRangeController:
    """Persist and distribute one shared comparison period to all vehicles."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store: Store[dict[str, Any]] = Store(hass, 1, f"{DOMAIN}.global")
        self._range_from: date | None = None
        self._range_to: date | None = None
        self._preset: str = RANGE_PRESET_CUSTOM
        self._runtimes: dict[str, Any] = {}
        self._unsub_midnight: Any | None = None

    async def async_setup(self) -> None:
        stored = await self.store.async_load()
        today = dt_util.now().date()
        month_start = today.replace(day=1)
        stored = stored or {}
        self._range_from = _parse_date(stored.get("range_from"), month_start)
        self._range_to = _parse_date(stored.get("range_to"), today)
        stored_preset = stored.get("preset", RANGE_PRESET_CUSTOM)
        self._preset = stored_preset if stored_preset in RANGE_PRESET_OPTIONS else RANGE_PRESET_CUSTOM

        # Rolling presets always end today, including after a restart on a new day.
        if self._preset != RANGE_PRESET_CUSTOM:
            self._apply_preset_dates(self._preset, today)
            await self._save()

        self._unsub_midnight = async_track_time_change(
            self.hass, self._async_midnight_rollover, hour=0, minute=0, second=2
        )

    @property
    def range_from(self) -> date:
        assert self._range_from is not None
        return self._range_from

    @property
    def range_to(self) -> date:
        assert self._range_to is not None
        return self._range_to

    @property
    def preset(self) -> str:
        return self._preset

    def register_runtime(self, entry_id: str, runtime: Any) -> None:
        self._runtimes[entry_id] = runtime

    def unregister_runtime(self, entry_id: str) -> None:
        self._runtimes.pop(entry_id, None)

    async def async_set_range_from(self, value: date) -> None:
        self._range_from = value
        self._preset = RANGE_PRESET_CUSTOM
        await self._save_and_refresh_all()

    async def async_set_range_to(self, value: date) -> None:
        self._range_to = value
        self._preset = RANGE_PRESET_CUSTOM
        await self._save_and_refresh_all()

    async def async_set_preset(self, preset: str) -> None:
        """Select a rolling date-range preset and refresh every vehicle."""
        if preset not in RANGE_PRESET_OPTIONS:
            raise ValueError(f"Unsupported comparison range preset: {preset}")
        self._preset = preset
        if preset != RANGE_PRESET_CUSTOM:
            self._apply_preset_dates(preset, dt_util.now().date())
        await self._save_and_refresh_all()

    def _apply_preset_dates(self, preset: str, today: date) -> None:
        """Set range dates for one rolling preset.

        Date entities are inclusive. 'Heute' means today through today.
        'Letzter Tag' means yesterday through today, matching the behavior agreed
        for this integration.
        """
        self._range_to = today
        if preset == RANGE_PRESET_TODAY:
            self._range_from = today
        elif preset == RANGE_PRESET_LAST_DAY:
            self._range_from = today - timedelta(days=1)
        elif preset == RANGE_PRESET_LAST_7_DAYS:
            self._range_from = today - timedelta(days=6)
        elif preset == RANGE_PRESET_LAST_MONTH:
            self._range_from = _previous_month(today)
        elif preset == RANGE_PRESET_LAST_YEAR:
            self._range_from = _previous_year(today)

    async def _save(self) -> None:
        await self.store.async_save(
            {
                "range_from": self.range_from.isoformat(),
                "range_to": self.range_to.isoformat(),
                "preset": self.preset,
            }
        )

    async def _save_and_refresh_all(self) -> None:
        """Persist the range and wait until every vehicle has recalculated it.

        Waiting here is intentional. A quick-selection service call must not
        return while the global date entities already show the new range but
        vehicle entities have not yet been notified. Selected-period values are
        derived synchronously from the daily ledger plus today's live counters,
        so this refresh is lightweight and cannot commit an older range later.
        """
        await self._save()

        # Clear vehicle results before publishing the new date controls. This
        # prevents the frontend from briefly pairing a new range with values
        # calculated for the previous range.
        runtimes = list(self._runtimes.values())
        for runtime in runtimes:
            runtime.invalidate_custom_period()

        async_dispatcher_send(self.hass, SIGNAL_GLOBAL_RANGE_UPDATE)

        refreshes = [runtime.async_refresh_custom_period() for runtime in runtimes]
        if refreshes:
            await asyncio.gather(*refreshes, return_exceptions=True)

    @callback
    def _async_midnight_rollover(self, now: Any) -> None:
        """Advance an active rolling preset to the new day automatically."""
        if self._preset == RANGE_PRESET_CUSTOM:
            return
        self.hass.async_create_task(self._async_refresh_preset_for_today())

    async def _async_refresh_preset_for_today(self) -> None:
        self._apply_preset_dates(self._preset, dt_util.now().date())
        await self._save_and_refresh_all()
