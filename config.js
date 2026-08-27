window.PORTAL_CONFIG = {
  // Publish the Google Sheet to the web as CSV, then paste the URL below.
  // Example:
  // https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv
  announcementsCsvUrl: "PASTE_PUBLISHED_GOOGLE_SHEET_CSV_URL_HERE",

  // Until we have a reliable grade source, "All" announcements always display.
  // You can also set this manually to "3rd", "4th", "5th", etc. for testing.
  studentAudience: "All",

  // Maximum announcements shown at one time.
  maxAnnouncements: 3,

  // Future web OAuth configuration.
  googleClientId: "",
  allowedDomain: "thebranchschool.org"
};
