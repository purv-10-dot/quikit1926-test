"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "hi";

const STORAGE_KEY = "qf-locale";

interface MessageTree {
  [key: string]: string | MessageTree;
}

type MessageValue = string | MessageTree;

const messages: Record<Locale, MessageTree> = {
  en: {
    nav: {
      groups: {
        Overview: "Overview",
        Sales: "Sales",
        Purchases: "Purchases",
        Accounting: "Accounting",
        Reports: "Reports",
        More: "More",
        Automation: "Automation",
        Settings: "Settings"
      },
      items: {
        Dashboard: "Dashboard",
        Customers: "Customers",
        Quotations: "Quotations",
        "Sales Orders": "Sales Orders",
        Invoices: "Invoices",
        "Credit Notes": "Credit Notes",
        "Payments Received": "Payments Received",
        Receivables: "Receivables",
        Vendors: "Vendors",
        "Purchase Orders": "Purchase Orders",
        "Goods Receipts": "Goods Receipts",
        Bills: "Bills",
        "Vendor Credits": "Vendor Credits",
        Expenses: "Expenses",
        "Payments Made": "Payments Made",
        Payables: "Payables",
        "Bank Accounts": "Bank Accounts",
        Reconciliation: "Reconciliation",
        Settlements: "Settlements",
        Rules: "Rules",
        "Chart of Accounts": "Chart of Accounts",
        "Journal Entries": "Journal Entries",
        "General Ledger": "General Ledger",
        "Day Book": "Day Book",
        "GST Command Center": "GST Command Center",
        "GSTR-1": "GSTR-1",
        "GSTR-3B": "GSTR-3B",
        "GSTR-2B Recon": "GSTR-2B Recon",
        "GST Summary": "GST Summary",
        "GST Parity": "GST Parity",
        Items: "Items",
        Warehouses: "Warehouses",
        Adjustments: "Adjustments",
        Transfers: "Transfers",
        Reports: "Reports",
        "Trial Balance": "Trial Balance",
        "P&L": "P&L",
        "Balance Sheet": "Balance Sheet",
        "Cash Flow": "Cash Flow",
        Aging: "Aging",
        "Sales Register": "Sales Register",
        "Purchase Register": "Purchase Register",
        "Customer Statement": "Customer Statement",
        "Vendor Statement": "Vendor Statement",
        "Stock Valuation": "Stock Valuation",
        "Budget vs Actual": "Budget vs Actual",
        "Project P&L": "Project P&L",
        Outstanding: "Outstanding",
        "Fixed Assets": "Fixed Assets",
        Inventory: "Inventory",
        Projects: "Projects",
        "Time Tracking": "Time Tracking",
        Budgets: "Budgets",
        "Document Vault": "Document Vault",
        "OCR Inbox": "OCR Inbox",
        "Migration Center": "Migration Center",
        Imports: "Imports",
        "OCR Bills": "OCR Bills",
        "Period Locks": "Period Locks",
        Integrations: "Integrations",
        Company: "Company",
        "Roles & Permissions": "Roles & Permissions",
        "Approval Policies": "Approval Policies",
        Taxes: "Taxes",
        Currencies: "Currencies",
        Users: "Users",
        Portals: "Portals"
      }
    },
    common: {
      search: "Search",
      save: "Save",
      reset: "Reset",
      previous: "Previous",
      next: "Next",
      columns: "Columns",
      csv: "CSV",
      pdf: "PDF",
      workflow: "Workflow",
      records: "Records",
      trackedValue: "Tracked value",
      importCsv: "Import CSV",
      exportPdf: "Export PDF",
      openWorkflow: "Open workflow",
      collectOnline: "Collect online",
      duplicate: "Duplicate",
      edit: "Edit",
      controls: "Controls",
      activity: "Activity",
      status: "Status",
      loading: "Loading...",
      pageOf: "Page {page} of {total}",
      selectedBulk: "{count} selected for bulk actions",
      rows: "{count} rows",
      yes: "Yes",
      no: "No",
      language: "Language",
      english: "English",
      hindi: "Hindi"
    },
    topbar: {
      placeholder: "Search invoices, contacts, accounts",
      profile: "Profile",
      settings: "Settings",
      signOut: "Sign out",
      signedOut: "Signed out.",
      companyFallback: "QuikFinance Workspace",
      fiscalYear: "Fiscal year {year} · {currency}"
    },
    auth: {
      loginTitle: "Welcome back",
      loginDescription: "Sign in to continue managing your books.",
      registerTitle: "Create your workspace",
      registerDescription: "Company, base currency, fiscal setup, and chart of accounts begin here.",
      email: "Email",
      password: "Password",
      signIn: "Sign in",
      continueGoogle: "Continue with Google",
      googleDisabled: "Google sign-in not enabled",
      newHere: "New here?",
      createAccount: "Create an account",
      alreadyRegistered: "Already registered?",
      companyName: "Company name",
      baseCurrency: "Base currency",
      createWorkspace: "Create account",
      signInLink: "Sign in",
      verifyEmail: "Check your email to verify your account.",
      supabaseMissing: "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
    },
    dashboard: {
      title: "Dashboard",
      description: "Revenue, cash, receivables, payables, and transaction activity.",
      newInvoice: "New Invoice",
      recordPayment: "Record Payment",
      addExpense: "Add Expense",
      newBill: "New Bill"
    },
    reports: {
      title: "Reports",
      description: "Financial statements, aging, ledger movement, customer sales, expense categories, and exports."
    },
    portals: {
      title: "Portals",
      description: "Create secure customer and CA portal links for external collaboration.",
      customerPortal: "Customer portal",
      caPortal: "CA portal",
      activeLinks: "Active links",
      createLink: "Create portal link",
      customerId: "Customer ID",
      contactLabel: "Customer",
      caEmail: "CA email",
      displayName: "Display name",
      expiresInDays: "Expires in days",
      portalUrl: "Portal URL",
      copy: "Copy",
      copied: "Copied to clipboard.",
      customerPortalPage: "Customer Portal",
      caPortalPage: "CA Portal",
      comments: "Comments",
      addComment: "Add comment",
      statement: "Statement",
      downloadStatement: "Download statement CSV",
      noComments: "No comments yet.",
      openPdf: "Open invoice PDF",
      payNow: "Pay now"
    },
    invoice: {
      shareTitle: "Invoice Payment Link",
      shareDescription: "Collect invoice {invoice} through Razorpay payment links and keep refunds synced back into accounts receivable.",
      invoice: "Invoice",
      createLink: "Create link",
      latestLink: "Latest link",
      customer: "Customer",
      total: "Total",
      balanceDue: "Balance due",
      requested: "Requested",
      paid: "Paid",
      refunded: "Refunded",
      allowPartial: "Allow partial payments",
      expiryDays: "Expiry in days",
      createRazorpayLink: "Create Razorpay link",
      openPaymentLink: "Open payment link",
      cancelLink: "Cancel link",
      noLink: "No payment link has been created for this invoice yet.",
      webhookUrl: "Razorpay webhook URL:",
      paymentConfiguredMissing: "Razorpay keys are not configured yet.",
      pdfDownload: "Download PDF",
      whatsappShare: "Share on WhatsApp",
      upiIntent: "Open UPI intent",
      portalLink: "Customer portal link",
      einvoice: "E-invoice fields",
      taxBreakup: "GST breakup"
    }
  },
  hi: {
    nav: {
      groups: {
        Overview: "अवलोकन",
        Sales: "बिक्री",
        Purchases: "खरीद",
        Banking: "बैंकिंग",
        Accounting: "लेखा",
        Tax: "कर",
        Inventory: "इन्वेंटरी",
        Reports: "रिपोर्ट",
        Projects: "प्रोजेक्ट",
        Documents: "दस्तावेज़",
        Settings: "सेटिंग्स"
      },
      items: {
        Dashboard: "डैशबोर्ड",
        Customers: "ग्राहक",
        Quotations: "कोटेशन",
        "Sales Orders": "सेल्स ऑर्डर",
        Invoices: "चालान",
        "Credit Notes": "क्रेडिट नोट",
        "Payments Received": "प्राप्त भुगतान",
        Receivables: "देय राशि",
        Vendors: "विक्रेता",
        "Purchase Orders": "परचेज ऑर्डर",
        "Goods Receipts": "माल रसीद",
        Bills: "बिल",
        "Vendor Credits": "विक्रेता क्रेडिट",
        Expenses: "खर्चे",
        "Payments Made": "किए गए भुगतान",
        Payables: "देनदारियाँ",
        "Bank Accounts": "बैंक खाते",
        Reconciliation: "बैंक मिलान",
        Settlements: "सेटलमेंट",
        Rules: "नियम",
        "Chart of Accounts": "चार्ट ऑफ अकाउंट्स",
        "Journal Entries": "जर्नल एंट्री",
        "General Ledger": "सामान्य खाता बही",
        "Day Book": "दैनिक पुस्तक",
        "GST Command Center": "GST कमांड सेंटर",
        "GSTR-1": "GSTR-1",
        "GSTR-3B": "GSTR-3B",
        "GSTR-2B Recon": "GSTR-2B मिलान",
        "GST Summary": "जीएसटी सारांश",
        "GST Parity": "जीएसटी मिलान",
        Items: "आइटम",
        Warehouses: "गोदाम",
        Adjustments: "समायोजन",
        Transfers: "स्थानांतरण",
        Reports: "रिपोर्ट",
        "Trial Balance": "परीक्षण शेष",
        "P&L": "लाभ और हानि",
        "Balance Sheet": "तुलन पत्र",
        "Cash Flow": "कैश फ्लो",
        Aging: "एजिंग",
        "Sales Register": "बिक्री रजिस्टर",
        "Purchase Register": "खरीद रजिस्टर",
        "Customer Statement": "ग्राहक विवरण",
        "Vendor Statement": "विक्रेता विवरण",
        "Stock Valuation": "स्टॉक मूल्यांकन",
        "Budget vs Actual": "बजट बनाम वास्तविक",
        "Project P&L": "प्रोजेक्ट लाभ-हानि",
        Outstanding: "बकाया",
        "Fixed Assets": "स्थिर संपत्तियाँ",
        Inventory: "इन्वेंटरी",
        Projects: "प्रोजेक्ट",
        "Time Tracking": "समय ट्रैकिंग",
        Budgets: "बजट",
        "Document Vault": "दस्तावेज़ तिजोरी",
        "OCR Inbox": "OCR इनबॉक्स",
        "Migration Center": "माइग्रेशन सेंटर",
        Imports: "इम्पोर्ट",
        "OCR Bills": "OCR बिल",
        "Period Locks": "पीरियड लॉक",
        Integrations: "इंटीग्रेशन",
        Company: "कंपनी",
        "Roles & Permissions": "भूमिकाएँ और अनुमतियाँ",
        "Approval Policies": "अनुमोदन नीतियाँ",
        Taxes: "कर",
        Currencies: "मुद्राएँ",
        Users: "उपयोगकर्ता",
        Portals: "पोर्टल"
      }
    },
    common: {
      search: "खोजें",
      save: "सहेजें",
      reset: "रीसेट",
      previous: "पिछला",
      next: "अगला",
      columns: "कॉलम",
      csv: "CSV",
      pdf: "PDF",
      workflow: "वर्कफ़्लो",
      records: "रिकॉर्ड",
      trackedValue: "ट्रैक की गई राशि",
      importCsv: "CSV इम्पोर्ट",
      exportPdf: "PDF एक्सपोर्ट",
      openWorkflow: "वर्कफ़्लो खोलें",
      collectOnline: "ऑनलाइन संग्रह",
      duplicate: "डुप्लिकेट",
      edit: "संपादित करें",
      controls: "कंट्रोल",
      activity: "गतिविधि",
      status: "स्थिति",
      loading: "लोड हो रहा है...",
      pageOf: "पृष्ठ {page} / {total}",
      selectedBulk: "{count} रिकॉर्ड चुने गए",
      rows: "{count} पंक्तियाँ",
      yes: "हाँ",
      no: "नहीं",
      language: "भाषा",
      english: "English",
      hindi: "हिंदी"
    },
    topbar: {
      placeholder: "चालान, संपर्क, खाते खोजें",
      profile: "प्रोफ़ाइल",
      settings: "सेटिंग्स",
      signOut: "साइन आउट",
      signedOut: "साइन आउट हो गया।",
      companyFallback: "क्विकफाइनेंस वर्कस्पेस",
      fiscalYear: "वित्तीय वर्ष {year} · {currency}"
    },
    auth: {
      loginTitle: "फिर से स्वागत है",
      loginDescription: "अपनी बहीखाता प्रबंधन जारी रखने के लिए साइन इन करें।",
      registerTitle: "अपना वर्कस्पेस बनाएं",
      registerDescription: "कंपनी, बेस करेंसी, वित्तीय सेटअप और चार्ट ऑफ अकाउंट्स यहीं से शुरू होते हैं।",
      email: "ईमेल",
      password: "पासवर्ड",
      signIn: "साइन इन",
      continueGoogle: "Google से जारी रखें",
      googleDisabled: "Google साइन-इन सक्षम नहीं है",
      newHere: "नए हैं?",
      createAccount: "अकाउंट बनाएं",
      alreadyRegistered: "पहले से पंजीकृत हैं?",
      companyName: "कंपनी का नाम",
      baseCurrency: "बेस करेंसी",
      createWorkspace: "अकाउंट बनाएं",
      signInLink: "साइन इन",
      verifyEmail: "ईमेल सत्यापित करने के लिए अपना मेल देखें।",
      supabaseMissing: "Supabase कॉन्फ़िगर नहीं है। .env.local में NEXT_PUBLIC_SUPABASE_URL और NEXT_PUBLIC_SUPABASE_ANON_KEY जोड़ें।"
    },
    dashboard: {
      title: "डैशबोर्ड",
      description: "राजस्व, नकदी, देयक, देनदारियाँ और लेनदेन गतिविधि।",
      newInvoice: "नया चालान",
      recordPayment: "भुगतान दर्ज करें",
      addExpense: "खर्च जोड़ें",
      newBill: "नया बिल"
    },
    reports: {
      title: "रिपोर्ट",
      description: "वित्तीय विवरण, एजिंग, लेजर गतिविधि, ग्राहक बिक्री, खर्च श्रेणियाँ और एक्सपोर्ट।"
    },
    portals: {
      title: "पोर्टल",
      description: "बाहरी सहयोग के लिए सुरक्षित ग्राहक और CA पोर्टल लिंक बनाएं।",
      customerPortal: "ग्राहक पोर्टल",
      caPortal: "CA पोर्टल",
      activeLinks: "सक्रिय लिंक",
      createLink: "पोर्टल लिंक बनाएं",
      customerId: "ग्राहक आईडी",
      contactLabel: "ग्राहक",
      caEmail: "CA ईमेल",
      displayName: "डिस्प्ले नाम",
      expiresInDays: "समाप्ति (दिनों में)",
      portalUrl: "पोर्टल URL",
      copy: "कॉपी",
      copied: "क्लिपबोर्ड पर कॉपी किया गया।",
      customerPortalPage: "ग्राहक पोर्टल",
      caPortalPage: "CA पोर्टल",
      comments: "टिप्पणियाँ",
      addComment: "टिप्पणी जोड़ें",
      statement: "स्टेटमेंट",
      downloadStatement: "स्टेटमेंट CSV डाउनलोड करें",
      noComments: "अभी कोई टिप्पणी नहीं है।",
      openPdf: "चालान PDF खोलें",
      payNow: "अभी भुगतान करें"
    },
    invoice: {
      shareTitle: "इनवॉइस पेमेंट लिंक",
      shareDescription: "Razorpay पेमेंट लिंक से इनवॉइस {invoice} की वसूली करें और रिफंड्स को अकाउंट्स रिसीवेबल में सिंक रखें।",
      invoice: "चालान",
      createLink: "लिंक बनाएं",
      latestLink: "नवीनतम लिंक",
      customer: "ग्राहक",
      total: "कुल",
      balanceDue: "बकाया राशि",
      requested: "मांगी गई राशि",
      paid: "भुगतान",
      refunded: "रिफंड",
      allowPartial: "आंशिक भुगतान की अनुमति दें",
      expiryDays: "समाप्ति (दिनों में)",
      createRazorpayLink: "Razorpay लिंक बनाएं",
      openPaymentLink: "पेमेंट लिंक खोलें",
      cancelLink: "लिंक रद्द करें",
      noLink: "इस चालान के लिए अभी कोई पेमेंट लिंक नहीं बना है।",
      webhookUrl: "Razorpay वेबहुक URL:",
      paymentConfiguredMissing: "Razorpay keys अभी कॉन्फ़िगर नहीं हैं।",
      pdfDownload: "PDF डाउनलोड",
      whatsappShare: "WhatsApp पर शेयर करें",
      upiIntent: "UPI इंटेंट खोलें",
      portalLink: "ग्राहक पोर्टल लिंक",
      einvoice: "ई-इनवॉइस फ़ील्ड",
      taxBreakup: "GST ब्रेकअप"
    }
  }
};

function resolveMessage(locale: Locale, path: string): string | null {
  const parts = path.split(".");
  let current: MessageValue | undefined = messages[locale];
  for (const part of parts) {
    if (!current || typeof current === "string") {
      return null;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : null;
}

function interpolate(template: string, variables?: Record<string, string | number>) {
  if (!variables) {
    return template;
  }

  return Object.entries(variables).reduce((value, [key, replacement]) => value.replaceAll(`{${key}}`, String(replacement)), template);
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: string, fallback?: string, variables?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "hi") {
      setLocaleState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => setLocaleState(nextLocale),
      t: (path, fallback, variables) => interpolate(resolveMessage(locale, path) ?? fallback ?? path, variables)
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider.");
  }
  return context;
}

export function translateModuleMeta(locale: Locale, key: string, fallback: { title: string; description: string; entityName: string; primaryAction?: string }) {
  const overrides: Record<Locale, Record<string, Partial<typeof fallback>>> = {
    en: {},
    hi: {
      customers: { title: "ग्राहक", entityName: "ग्राहक", primaryAction: "नया ग्राहक" },
      vendors: { title: "विक्रेता", entityName: "विक्रेता", primaryAction: "नया विक्रेता" },
      invoices: { title: "चालान", entityName: "चालान", primaryAction: "नया चालान" },
      quotations: { title: "कोटेशन", entityName: "कोटेशन", primaryAction: "नया कोटेशन" },
      "sales-orders": { title: "सेल्स ऑर्डर", entityName: "सेल्स ऑर्डर", primaryAction: "नया सेल्स ऑर्डर" },
      bills: { title: "बिल", entityName: "बिल", primaryAction: "नया बिल" },
      "purchase-orders": { title: "परचेज ऑर्डर", entityName: "परचेज ऑर्डर", primaryAction: "नया परचेज ऑर्डर" },
      "credit-notes": { title: "क्रेडिट नोट", entityName: "क्रेडिट नोट", primaryAction: "नया क्रेडिट नोट" },
      "vendor-credits": { title: "विक्रेता क्रेडिट", entityName: "विक्रेता क्रेडिट", primaryAction: "नया विक्रेता क्रेडिट" },
      "payments-received": { title: "प्राप्त भुगतान", entityName: "भुगतान" },
      "payments-made": { title: "किए गए भुगतान", entityName: "भुगतान" },
      expenses: { title: "खर्चे", entityName: "खर्च", primaryAction: "खर्च जोड़ें" },
      "journal-entries": { title: "जर्नल एंट्री", entityName: "जर्नल एंट्री", primaryAction: "नई एंट्री" },
      "chart-of-accounts": { title: "चार्ट ऑफ अकाउंट्स", entityName: "खाता" },
      "bank-accounts": { title: "बैंक खाते", entityName: "बैंक खाता" },
      imports: { title: "इम्पोर्ट", entityName: "इम्पोर्ट जॉब", primaryAction: "नया इम्पोर्ट" },
      "ocr-bills": { title: "OCR बिल", entityName: "OCR दस्तावेज़", primaryAction: "नया OCR ड्राफ्ट" },
      "period-locks": { title: "पीरियड लॉक", entityName: "पीरियड लॉक", primaryAction: "पीरियड लॉक करें" },
      budgets: { title: "बजट", entityName: "बजट" },
      "fixed-assets": { title: "स्थिर संपत्तियाँ", entityName: "संपत्ति", primaryAction: "नई संपत्ति" },
      inventory: { title: "इन्वेंटरी", entityName: "आइटम" },
      projects: { title: "प्रोजेक्ट", entityName: "प्रोजेक्ट" },
      "time-tracking": { title: "समय ट्रैकिंग", entityName: "समय प्रविष्टि", primaryAction: "समय दर्ज करें" },
      taxes: { title: "कर", entityName: "कर दर" },
      currencies: { title: "मुद्राएँ", entityName: "मुद्रा" },
      receivables: { title: "देय राशि", entityName: "चालान" },
      payables: { title: "देनदारियाँ", entityName: "बिल" },
      "goods-receipts": { title: "माल रसीद", entityName: "GRN", primaryAction: "नई GRN" },
      warehouses: { title: "गोदाम", entityName: "गोदाम", primaryAction: "नया गोदाम" },
      "stock-adjustments": { title: "स्टॉक समायोजन", entityName: "समायोजन", primaryAction: "नया समायोजन" },
      "stock-transfers": { title: "स्टॉक स्थानांतरण", entityName: "स्थानांतरण", primaryAction: "नया स्थानांतरण" },
      "approval-policies": { title: "अनुमोदन नीतियाँ", entityName: "नीति", primaryAction: "नई नीति" },
      "approval-requests": { title: "अनुमोदन अनुरोध", entityName: "अनुरोध" },
      "bank-rules": { title: "बैंक नियम", entityName: "नियम", primaryAction: "नया नियम" },
      settlements: { title: "सेटलमेंट", entityName: "सेटलमेंट" },
      documents: { title: "दस्तावेज़ तिजोरी", entityName: "दस्तावेज़", primaryAction: "अपलोड करें" },
      "migration-center": { title: "माइग्रेशन सेंटर", entityName: "इम्पोर्ट" },
      "roles-permissions": { title: "भूमिकाएँ और अनुमतियाँ", entityName: "भूमिका" }
    }
  };

  return {
    ...fallback,
    ...(overrides[locale][key] ?? {})
  };
}

export function translateReportMeta(locale: Locale, key: string, fallback: { title: string; description: string }) {
  const overrides: Record<Locale, Record<string, Partial<typeof fallback>>> = {
    en: {},
    hi: {
      "profit-loss": { title: "लाभ और हानि" },
      "balance-sheet": { title: "तुलन पत्र" },
      "trial-balance": { title: "परीक्षण शेष" },
      "cash-flow": { title: "कैश फ्लो" },
      aging: { title: "एजिंग" },
      "gst-summary": { title: "जीएसटी सारांश" },
      "gst-parity": { title: "जीएसटी मिलान" },
      "gstr-1": { title: "GSTR-1" },
      "gstr-3b": { title: "GSTR-3B" },
      outstanding: { title: "बकाया" },
      "general-ledger": { title: "सामान्य खाता बही" },
      "day-book": { title: "दैनिक पुस्तक" },
      "sales-register": { title: "बिक्री रजिस्टर" },
      "purchase-register": { title: "खरीद रजिस्टर" },
      "customer-statement": { title: "ग्राहक विवरण" },
      "vendor-statement": { title: "विक्रेता विवरण" },
      "stock-valuation": { title: "स्टॉक मूल्यांकन" },
      "budget-vs-actual": { title: "बजट बनाम वास्तविक" },
      "project-profitability": { title: "प्रोजेक्ट लाभ-हानि" },
      "gst-command-center": { title: "GST कमांड सेंटर" },
      "gstr2b": { title: "GSTR-2B मिलान" }
    }
  };

  return {
    ...fallback,
    ...(overrides[locale][key] ?? {})
  };
}
