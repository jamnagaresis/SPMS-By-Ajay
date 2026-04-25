# 📊 IT Tax & Payroll Analyzer

A powerful tool to parse Payroll PDFs, manage employee data, and generate tax/salary reports.

## 🚀 Quick Start (How to run)

1.  **Install Node.js**: Make sure you have Node.js installed on your PC.
2.  **Unzip**: Extract this folder.
3.  **Install Dependencies**:
    Open the folder in a terminal (Command Prompt or PowerShell) and run:
    ```bash
    npm install
    ```
4.  **Setup Environment**:
    - Rename `.env.local.example` to `.env.local`
    - Open `.env.local` and add your Supabase keys:
      ```
      NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
      NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
      ```
5.  **Run Locally**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🗄️ Database Setup (Supabase)

If you are setting this up for the first time on a new Supabase project, run these SQL scripts in the **SQL Editor** in this order:

1.  **`SUPABASE_SETUP.sql`** (Basic structure)
2.  **`SUPABASE_MIGRATION_PAYROLL.sql`** (Payroll tables)
3.  **`SUPABASE_MIGRATION_HRPN.sql`** (HRPN support)

## ☁️ How to Deploy to Vercel

1.  Push this code to a **GitHub repository**.
2.  Go to **Vercel** -> **Add New Project**.
3.  Import your GitHub repository.
4.  In **Environment Variables**, add:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5.  Click **Deploy**.

## ✨ Features

- **Payroll Upload**: Drag & drop PDF parsing.
- **Employee Sync**: Auto-links employees by HRPN and PAN.
- **Smart Reports**:
  - Employee Salary History (Monthly/Yearly)
  - Income Tax Summary (for filing)
  - Full Monthly Payroll Export
