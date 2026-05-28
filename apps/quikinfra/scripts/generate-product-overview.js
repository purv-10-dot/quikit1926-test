const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} = require("docx");

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 24 } },
    },
    paragraphStyles: [
      {
        id: "Title",
        name: "Title",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 44, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 0, after: 120 }, alignment: AlignmentType.CENTER },
      },
      {
        id: "Subtitle",
        name: "Subtitle",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, font: "Arial", color: "555555", italics: true },
        paragraph: { spacing: { before: 0, after: 480 }, alignment: AlignmentType.CENTER },
      },
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 30, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          style: "Title",
          children: [new TextRun("QuikInfra")],
        }),
        new Paragraph({
          style: "Subtitle",
          children: [new TextRun("Product Overview")],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("What is QuikInfra?")],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun(
              "QuikInfra is an end-to-end Construction ERP built for builders, contractors, and infrastructure companies. It brings every part of a construction business — site execution, procurement, stores, finance, manpower, quality, and safety — into one connected system, replacing the patchwork of spreadsheets, email approvals, and disconnected tools that most firms rely on today."
            ),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("The Problem It Solves")],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun(
              "Construction projects bleed money in the gaps — between the site engineer raising an indent and the store issuing material, between the vendor delivering goods and finance releasing payment, between the BOQ on paper and the actual work billed at the end of the month. QuikInfra closes these gaps by tying every transaction to a project, a cost centre, and an approval trail, so nothing happens off-the-books and nothing gets lost between departments."
            ),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("How It Works")],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun(
              "The platform follows the natural flow of a construction project — from estimation and BOQ at the start, through daily site progress, procurement, material movement, labour and machinery deployment, quality checks, and safety reporting, all the way to client billing and vendor payments. Each step feeds the next, with structured approvals at every stage and a single source of truth for project costs, stock positions, and outstanding payments."
            ),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("Who It's For")],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun(
              "Mid-sized to large construction firms, civil contractors, and infrastructure companies running multiple projects, sites, and vendors at once — organisations that have outgrown ad-hoc tools and need disciplined, role-based control over their operations without losing the speed that site work demands."
            ),
          ],
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun("The Value")],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun(
              "One unified system. One approval trail. One real-time view of every project, every rupee, and every kilogram of material on site. The result is faster decisions, tighter cost control, fewer disputes with vendors and clients, and a clear audit trail across the entire business."
            ),
          ],
        }),
      ],
    },
  ],
});

const outPath = path.join(
  "c:/Users/akhilesh/Desktop/Bhavna/Main-ERP/QuickConstructionProject",
  "QuikInfra-Product-Overview.docx"
);

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote:", outPath);
});
