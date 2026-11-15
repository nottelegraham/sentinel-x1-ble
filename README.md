# Sentinel X1 BLE

Local Home Assistant control for the **Kamoer X1 Bluetooth dosing pump** (the original X1, not the Wi-Fi X1 Pro). An ESP32-C6 running ESPHome talks to the pump over Bluetooth; a Home Assistant package and dashboard card turn it into a simple, reliable doser.

No cloud, no Kamoer account, no changes to the pump.

**Try it first:** open [`demo/index.html`](demo/index.html) in a browser. It runs the real dashboard card against a simulated pump.

## What you get

- **Daily volume split into even doses** across 24 hours or a time window you choose, on the days of the week you choose. HA runs the schedule, so the X1's 12-doses-a-day limit no longer applies (up to 48).
- **Manual dose, prime and STOP** from the dashboard.
- **Every dose confirmed by the pump.** Totals only count a dose after the pump reports it started; failed doses are retried twice, then you get an alert.
- **Container tracking:** level, days left, a low-container alert and a Refilled button.
- **Calibration from the dashboard:** run 10 s, enter what you measured, save it to the pump. A reminder appears after 3 months; you can dismiss it.
- **Daily safety limit** that skips any dose that would pass it.
- **Supplement name**, **phone alerts**, a **7-day history** chart and a **dose log**.
- Works on desktop and in the HA phone app.

## What's in this repository

| Path | What it is |
|---|---|
| `esphome/sentinel-x1-ble.yaml` | ESPHome config for the ESP32-C6 bridge |
| `homeassistant/packages/sentinel_x1_ble.yaml` | Dosing engine: helpers, scheduler, accounting, alerts |
| `homeassistant/www/sentinel-x1-ble/sentinel-x1-ble-card.js` | Dashboard card (`custom:sentinel-x1-ble-card`) |
| `demo/index.html` | Self-contained interactive demo |
| `docs/protocol.md` | The pump's Bluetooth protocol, decoded |

## Hardware

- Kamoer X1 Bluetooth pump
- Any ESP32-C6 board, within Bluetooth range of the pump (same room is best)

## Install

1. **Find your pump's address.** In the ESPHome Device Builder, flash the bridge once with any address, open its logs, and look for `Found device XX:XX:XX:XX:XX:XX` near a pump advertising as `x1_…`. Or use any Bluetooth scanner app.
2. **Bridge.** In the ESPHome Device Builder, create a device, paste `esphome/sentinel-x1-ble.yaml`, set `pump_mac`, and add `wifi_ssid`, `wifi_password` and `sentinel_x1_ble_api_key` to your ESPHome secrets. Install over USB the first time.
3. **Add it to Home Assistant** when it's discovered. Then open *Settings → Devices & services → ESPHome → Sentinel X1 BLE → Configure* and turn on **Allow the device to perform Home Assistant actions** (the bridge uses events to confirm doses).
4. **Package.** Copy `homeassistant/packages/sentinel_x1_ble.yaml` to `/config/packages/` and add under `homeassistant:`:
   ```yaml
   homeassistant:
     packages:
       sentinel_x1_ble: !include packages/sentinel_x1_ble.yaml
   ```
   In the `x1ble_notify` script, change `notify.notify` to your phone (for example `notify.mobile_app_your_phone`). Check the configuration and restart.
5. **Card.** Copy the `www/sentinel-x1-ble` folder to `/config/www/`, add the resource `/local/sentinel-x1-ble/sentinel-x1-ble-card.js` (JavaScript module), and create a dashboard with one panel view containing:
   ```yaml
   type: custom:sentinel-x1-ble-card
   ```
   Optional: add `history_start: "2026-01-31T16:00:00"` to hide log entries and chart data from before you started using the pump.
6. **Delete the pump's built-in schedule** in the Kamoer app, then close the app. The pump accepts one Bluetooth connection at a time.
7. Open the dashboard, calibrate, set your daily volume on **Setup**, and turn on **Auto dosing**.

## How it works

The bridge connects only when there's a command, sends it, confirms the pump started, and disconnects after a few seconds idle, the same way the Kamoer app does. An ESP32-C6 shares one radio between Wi-Fi and Bluetooth and can't hold a constant link to this pump; short sessions are reliable. Doses run on the pump itself once started.

Home Assistant actions exposed by the bridge:

| Action | Data |
|---|---|
| `esphome.sentinel_x1_ble_dose` | `ml` (0.1–6000, 0.1 mL steps) |
| `esphome.sentinel_x1_ble_run_seconds` | `seconds` (0.5–65) |
| `esphome.sentinel_x1_ble_stop` | — |
| `esphome.sentinel_x1_ble_calibrate` | `measured_ml` (volume from a 10 s run) |
| `esphome.sentinel_x1_ble_refresh` | — (sync clock, read calibration) |

## Limits

- The X1 has no speed control. Small daily volumes are delivered as many small doses; the smallest dose is 0.1 mL, and remainders carry over to later doses.
- A time window can't cross midnight.
- This is beta software. Keep your usual safeguards in place and watch the first few days of dosing.

## License

Free for personal, hobby and other noncommercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE). Selling this software, devices built with it, or any part of it requires written permission from TelegrahamTested. Independent project; not affiliated with Kamoer.
