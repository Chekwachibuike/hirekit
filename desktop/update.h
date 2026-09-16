/*
 * HireKit payload updater — staged, background, exe-free.
 *
 * Only the SERVER PAYLOAD (.next\standalone) is updated here; HireKit.exe
 * itself is never touched, so there is no running-binary replacement dance.
 *
 * Model (the Chrome/VS Code one): never block startup on the network.
 *
 *   launch N   : apply any payload staged by run N-1 (fast, local, offline)
 *                ... app runs normally ...
 *                background thread checks/downloads/stages for run N+1
 *   launch N+1 : applies it
 *
 * The swap is safe because it happens BEFORE spawn_server() — nothing in
 * the folder is running or locked at that moment.
 */
#ifndef HIREKIT_UPDATE_H
#define HIREKIT_UPDATE_H

/* Apply a payload staged by a previous run, if one is present and intact.
   Call early in WinMain, BEFORE the server is spawned. Fast and offline:
   a few directory renames. Returns 1 if a new payload was applied. */
int update_apply_staged(const char *exe_dir);

/* Spawn the background check/download/stage thread. Call AFTER the window
   is up — it must never delay startup. Never blocks; failures are silent
   (the app simply keeps running the version it already has). */
void update_start_background(const char *exe_dir);

#endif /* HIREKIT_UPDATE_H */
