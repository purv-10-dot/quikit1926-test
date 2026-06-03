module.exports = {
  launch_options: {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox"],
  },
  pdf_options: {
    format: "A4",
    margin: "20mm 18mm",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate:
      '<div style="font-size: 9px; color: #888; width: 100%; text-align: center; padding-top: 6px;">QuikTrack — Product Documentation</div>',
    footerTemplate:
      '<div style="font-size: 9px; color: #888; width: 100%; text-align: center; padding-bottom: 6px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span> · QuikIT Platform · Confidential</div>',
  },
};
