THE BRANCH SCHOOL STUDENT PORTAL — GITHUB READY

This package preserves the exact v17 dashboard layout and styling from the Chrome extension.

UPLOAD TO GITHUB
Upload these items to the ROOT of the repository:
- index.html
- styles.css
- app.js
- config.js
- assets/  (folder)

The assets folder must contain:
- bear-header.png
- portal-badge.png

WHAT CHANGED FROM THE EXTENSION
- newtab.html was renamed to index.html.
- newtab.js was renamed to app.js.
- Chrome-only chrome.identity code was removed so the page runs normally on GitHub Pages.
- Student Info is ready for Google web OAuth, which we will wire next.
- Announcements Google Sheet logic is preserved.

DO NOT upload manifest.json for the website version.
