Read `README.md` and `HANDOFF.md` first.

## End of a session (local or cloud, any account)

When I say "wrap up", or before a session ends:

1. Update `HANDOFF.md`. At the top, add today's date, then:
   - where things stand, in one or two sentences;
   - the single next step;
   - decisions only I can make, short and written as instructions to me. Remove any that are settled.
2. Say which branch the work is on and whether it's merged into main.
3. Screenshots for my Studio Board. They all live in `screenshots/` at the top of the repo:
   - **Mine (the cover):** exactly one file with "current" in its name, `screenshots/third-eye-current.png`. When I give you a screenshot and say to make it the current one, save that exact image under that name. Don't retake, crop or edit it. If you can't get at the image file itself, tell me; don't recreate it.
   - **Only one "current":** before saving a new one, rename the old one to the date it was made current (or its last commit date), e.g. `third-eye-2026-10-26.png`. Never delete it. If I say "drop the current screenshot", rename it the same way.
   - **Yours:** at the end of a session, if the project has a page you can run here, open its main view in a headless browser at 1440×900 and save the full view (not a detail) as `screenshots/third-eye-session.png`. Skip it if it can't run here (a Mac app, say); never commit a blank or error page. Replace the last one; don't keep a series.
   - Never put "current" in any other file name. Keep each image under about 2 MB (save as .jpg if it's bigger).
   - One time: if a `.board/` folder exists, move its images into `screenshots/` under these names, then delete `.board/`.
4. Commit the handoff (and any screenshots) with the work and push the branch.
