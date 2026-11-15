# Kamoer X1 (Bluetooth) protocol notes

Decoded from Bluetooth captures of the Kamoer X1 Mac app talking to an X1 (non-Pro, Bluetooth-only) pump. Every value below was confirmed on a real pump.

## Transport

- Bluetooth LE, no pairing, no encryption.
- Service `FFE0`, characteristic `FFE1` (properties: read, write-without-response, notify).
- Commands are written to `FFE1`; replies arrive as notifications on `FFE1`.
- Frames are **Modbus RTU**: `01 <function> <register hi> <register lo> … <CRC16>`. The slave address is `01`. The CRC is standard Modbus CRC-16 (poly `0xA001`, init `0xFFFF`), low byte first.
- The pump advertises as `x1_<8 hex digits>`; the hex digits are the device ID also returned by register `3003`.
- The pump accepts one Bluetooth connection at a time. The bridge connects per command and disconnects when idle, like the app.

## Commands

| Action | Frame (without CRC) | Notes |
|---|---|---|
| Set dose volume and mode | `01 10 3032 0002 04 0000 VVVV` | `3032` = mode 0 (volume dose), `3033` = volume in 0.1 mL (`00C8` = 20.0 mL) |
| Timed run | `01 06 3032 MMMM` | `3032` = run time in ms (`2710` = 10 s); used for calibration |
| Run until stopped | `01 06 3032 FFFE` | used for priming |
| Start | `01 05 1002 FF00` | starts whatever `3032`/`3033` describe; each press is a full dose |
| Stop | `01 05 1002 0000` | |
| Running? | `01 01 1002 0001` | reply `01 01 01 0X`: bit 0 = running |
| Calibration | `01 06 3009 TTTT` | milliseconds per mL. 60000 / TTTT = mL/min (`05BE` = 1470 → 40.8 mL/min) |
| Apply / save | `01 05 1003 FF00` | the app sends this after calibration and clock writes |
| Set clock | `01 10 300F 0003 06 YY MM DD hh mm ss` | year is two digits |
| Read clock | `01 03 300F 0006` | reply: year, month, day, hour, minute, second as 16-bit words |
| Device info | `01 03 3003 0005` | includes the 8-hex-digit device ID |
| Roll call | `01 05 1001 FF00` | makes the pump identify itself |

After a timed or continuous run the app writes `3032 = 0000` to return to volume mode; the bridge does the same.

## Registers seen but not needed

| Register | Seen as | Likely meaning |
|---|---|---|
| `300D` | `0001` | built-in schedule on/off |
| `3016`–`3018` | 2024-10-20 | built-in schedule start date |
| `301A`–`3025` | 3 or 4 each | per-slot values for the built-in schedule |
| `3026`–`3031` | `0000`, `0200` … `1600` | 12 dose times, one byte hour, one byte minute |

Home Assistant runs the schedule, so the pump's built-in schedule should be deleted in the Kamoer app before auto dosing is turned on.
