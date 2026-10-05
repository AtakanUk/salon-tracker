# Operator guide

*For the salon owner. No technical knowledge needed; this page can be printed and kept.*

## The system runs by itself

Normally **there is nothing to do**:

- If the app crashes, it **restarts automatically**.
- Every night a **backup is taken and mailed to you** (just keep the mails).
- If something goes wrong, **an alert arrives by mail**; when it is over, a "recovered" mail follows.

## If a "shared password" is asked when opening the app

The system can be published in two ways. If your tablets have the **Tailscale** app,
you go straight in. Otherwise there is a **shared gate password** in front of the app.
It is the same for everyone and does not replace your own username and password -
after the box, the app's normal sign-in screen appears. If you forget it, ask the
person who set up the system.

The box is **the browser's own window**, not part of the app, so it is in English
("Sign in") and cannot be translated.

**Each device enters this password once in its lifetime.** After that the phone or
tablet is recognised and never asked again - the employee goes straight to their own
username and password.

| Situation | Asked? |
|---|---|
| **First time** on a device | Yes, once |
| Every later visit | **No** |
| Browser fully closed and reopened / tablet restarted | No |
| A new phone or tablet, or **another browser** on the same device | Yes, once on that device |
| Browser history / cookies cleared | Yes, once more |

> What recognises the device is a **cookie**; clearing the browser deletes it and the
> password is asked once more. That is normal - just keep the password somewhere safe.

## Connecting to the server (if needed)

1. Open **PowerShell** on your computer (type "powershell" into the Start menu).
2. Type this and press Enter:

   ```
   ssh root@friseur
   ```

   (Tailscale has to be running on your computer - check the icon in the bottom right.)

3. Once connected, type:

   ```
   friseur
   ```

This menu opens:

```
╔═══════════════════════════════════════╗
║            FRISEUR ADMIN              ║
╠═══════════════════════════════════════╣
║  1) Show status                       ║
║  2) Restart the app                   ║
║  3) Restart everything                ║
║  4) Follow logs (quit: Ctrl+C)        ║
║  5) Show error logs                   ║
║  6) Back up now                       ║
║  7) Restore a backup (everything)     ║
║  8) Add missing records from backup   ║
║  9) Send a test mail                  ║
║ 10) Update (rebuild)                  ║
║ 11) Reset a password (locked out)     ║
║ 12) Disk cleanup (frees space)        ║
║  0) Quit                              ║
╚═══════════════════════════════════════╝
```

Type the number and press Enter. Every item also works directly, e.g. `friseur status`.

## Accounts (no server access needed)

All of this happens on the **Employees** page of the admin panel:

| Need | How |
|---|---|
| New employee | **+ New employee** at the top right |
| An employee forgot their password | **Reset password** on their row → tell them the password shown on screen |
| An employee left | **Delete** on their row (their name and revenue stay in all past records) |
| Temporary absence (leave, military service) | **Deactivate** in the delete dialog - the account stays in the list and comes back with one click |
| Deleted by mistake | **Deleted accounts** at the bottom of the page → **Restore** |
| Change your own password | **Password** at the top right (employees can do it on the tablet too) |

> Deleting **does not destroy data**. The person can no longer sign in and disappears
> from the list, but all their past records, their name and the revenue figures stay
> exactly as they were.
>
> Passwords need at least **8 characters**. When adding an employee, **Generate**
> suggests a suitable password (like `makas-4821`).

## Locked out of the panel (admin password forgotten)

The only way is to reset it on the server:

1. `ssh root@friseur` → `friseur` → **11**
2. Users are listed with numbers; type the admin's number
3. Type a new password (or just press Enter and the system makes one up)
4. Sign in with the password shown on screen

If the account was deleted by mistake, this **reopens** it.

## The "custom service" row in the price list

In the price list there is a row that says **"entered each time"** instead of a price.
That is not a mistake: it is for work that has no price in the list. When finishing a
record, the employee types the amount into that box and can add a short note
("bridal updo"). It counts towards revenue and reports like any other service, and all
of these are grouped under one heading in the reports.

- **You can rename it** (Edit) - there is no price field, because it has no price.
- **If you don't want it used**, Deactivate it; the box disappears from the employee
  screen. Old records stay as they are.

## What to do when

| Situation | What to do |
|---|---|
| "The app is down" mail arrived | Connect → `friseur` → **2** (restart) → **1** (check status) |
| Tablets cannot connect but no alert mail | First check that the **Tailscale** app is on on the tablet |
| Something behaves oddly | Restart with **2** - fixes most things |
| Still not fixed | **3** (restart everything); if that fails, call whoever set up the system |
| A few records are missing / were deleted by mistake | Panel → **System** → "Restore from backup" (see below) |
| Everything is broken | Stop entering records and do **7** (restore) together with whoever set up the system |
| Someone forgot their password | See "Accounts" above - mostly no server access needed |
| Disk filling up (banner or mail) | Connect → `friseur` → **12** (disk cleanup); if it stays, tell whoever set up the system |

## How do I know the system is healthy?

**You don't have to check: the panel tells you when something is wrong.** A yellow or
red banner appears at the top of the admin panel, on every page. It disappears by
itself once the problem is gone. There is no close button, because a closed warning is
a forgotten warning.

| The banner says | Meaning | What to do |
|---|---|---|
| Server disk above 85% | Space is running out | `friseur` → **12** (disk cleanup) |
| Last backup is old / failed | The nightly backup may not be running | System → "Create and download backup"; then tell whoever set up the system |
| Database cannot be reached | Serious | `friseur` → **2**, if that fails **3** |

The **System page** link next to the banner goes straight to the details.

If you want to look yourself, there are two more ways:

1. **The "System" page in the admin panel** - if all four cards are green, all is well.
   It also shows when the last backup was taken.
2. On the server: `friseur` → **1**.

## Backups

### Daily routine: download the backup (1 minute)

Open the **System** page in the admin panel → press **"⬇ Create and download backup"**.
A new backup with all data up to that moment is taken and downloaded to your device as
a single file (`.zip`).

**Do this once a day** (for example when closing the shop) and collect the files in a
folder on your computer. Even if something happens to the server, your data stays with you.

The zip contains three files:

- `.xlsx` → all records as an Excel sheet; double-click to open
- `.dump` → a complete copy of the database (to roll the system back)
- `.json.gz` → a technical copy (to recover lost records)

### Automatic backups

- Every night at 03:00 the server takes a backup by itself and mails it to you. The
  files **also stay on the server**: the last 60 days, plus **one backup per month for
  good**. If you need a month from last year, that file is still on the server.
- If the nightly backup is missed because the server was off, a catch-up backup is
  taken by itself shortly after it starts again.
- Older backups can also be downloaded one by one from the list on the System page.
- So there are three copies: the ones you downloaded, the ones in your mailbox and the
  ones on the server.

### Archive of a period

Sometimes you need a period, not everything - "keep 2025, then remove it from the
system". In the **"Archive a date range"** box on the **System** page, enter a start and
an end date; it shows right away how many records and how much revenue are in that
range, and **"⬇ Download archive"** downloads that period as one file.

It contains two files: `.xlsx` (to look at in Excel) and `.json.gz` (a copy that can be
restored into the system if needed).

> **Before deleting old records**: when you pick a date in the cleanup box, a
> **"⬇ Download the archive of the period to delete"** link appears inside the red box.
> Press it and keep the archive first, then delete. The deleted period can come back
> from this file if needed.

### Keeping a complete copy on your computer

The zip from the panel gives you the **latest** backup. Sometimes you want more: before
handing the server over to someone else, before a long holiday, or before a big change -
you want everything that is on the server to be with you as well. There are two
commands for this; both run on your own computer:

```powershell
.\ops\pull-snapshot.ps1 -Server root@friseur
```

In order, it: asks the server for a fresh backup · checks on the server that the dump
actually opens **before downloading** · downloads the whole backup folder and the secret
settings · compares the SHA-256 hash of every downloaded file with the server. If even
one does not match, it stops and tells you; a half-downloaded file never sits there
quietly pretending to be a backup.

Everything lands in a dated folder such as `C:\Friseur-Snapshots\2026-09-05-0158\`:

- `data\` → every backup on the server (`.dump`, `.json.gz`, `.xlsx`)
- `settings\friseur.env` → database password, shared gate password, mail settings.
  Without it you can bring the data back, but not rebuild the system exactly: the
  shared gate password changes and everyone has to sign in again.
- `README.txt` → what to do when you open the folder months later

Every run creates a new folder and leaves the old ones alone. A copy is small (about
1 MB), so space is not a concern.

> **This copy is the only one.** It is outside cloud sync, so if something happens to
> the computer the copy is gone too. Copy it to a USB stick now and then. It contains
> passwords; do not put it in a shared folder.

To put a backup back:

```powershell
.\ops\push-dump.ps1 -Server root@friseur
```

It lists your backups, uploads the one you pick and proves with a hash comparison that
the upload is intact. It does not roll the database back - `friseur restore` below does
that, because that is where the safeguards are.

**Rehearse your copy.** A file being there and a file working are two different things;
an untested backup is not a backup. A rehearsal does not touch the live database: the
dump is loaded into a throwaway postgres container, then the record count, the revenue
and the employee list are compared with the live system. Ask whoever set up the system
to do it; it takes a few minutes.

### Restoring a backup

There are two different situations; do not mix them up:

**1) A few records are missing / were deleted by mistake** → done in the panel, no
server access needed:

1. Unpack the downloaded backup zip on your computer (right-click → *Extract all*).
2. Panel → **System** → **"Restore from backup"** → **Choose file** → pick the
   **`.json.gz`** file inside (not the `.xlsx` or the `.dump`).
3. Press **Restore**.

The system only adds the records **it does not have**; none of the existing records
change, nothing is deleted. So pressing it twice by mistake does no harm either. Even an
employee who was deleted for good comes back with all of their records.

**2) The whole system is broken / the database is gone** → done on the server, ideally
together with whoever set up the system:

- `friseur` → **7** (Restore a backup): the database goes back to the moment the chosen
  backup was taken. Records entered after that are lost, so the system first saves a
  copy of the current state.
- Then `friseur` → **8** (Add missing records from backup) can add back the records from
  a newer backup.
- If the server is completely gone: set the system up on a new server, put the backup
  files you have (or the ones from your mailbox) into the `backups/` folder and follow
  the same steps.
