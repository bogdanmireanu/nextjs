import { sql } from "@vercel/postgres";
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoice,
  Revenue,
} from "./definitions";
import { formatCurrency } from "./utils";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchRevenue(): Promise<Revenue[]> {
  try {
    // Artificially delay a response for demo purposes.
    // Don't do this in production :)

    console.log("Fetching revenue data...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const { data, error } = await supabase
      .from<string, Revenue>("revenue")
      .select("*");

    console.log("Data fetch completed after 3 seconds.");

    return data || [];
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch revenue data.");
  }
}

export async function fetchLatestInvoices() {
  try {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
      amount,
      id,
      customers:customers (
        name,
        image_url,
        email
      )
    `
      )
      .order("date", { ascending: false })
      .limit(5);

    const latestInvoices = data?.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));

    return latestInvoices as unknown as LatestInvoice[];
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch the latest invoices.");
  }
}

export async function fetchCardData() {
  try {
    const invoiceCountPromise = supabase
      .from("invoices")
      .select("*", { count: "exact", head: true });
    const customerCountPromise = supabase
      .from("invoices")
      .select("*", { count: "exact", head: true });
    const paidInvoices = supabase
      .from("invoices")
      .select("*")
      .eq("status", "paid");
    const pendingInvoices = supabase
      .from("invoices")
      .select("*")
      .eq("status", "pending");

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      paidInvoices,
      pendingInvoices,
    ]);

    const numberOfInvoices = Number(data[0].count ?? "0");
    const numberOfCustomers = Number(data[1].count ?? "0");

    const totalPaidInvoices = formatCurrency(
      data[2].data?.reduce((sum, invoice) => sum + invoice.amount, 0) ?? "0"
    );
    const totalPendingInvoices = formatCurrency(
      data[3].data?.reduce((sum, invoice) => sum + invoice.amount, 0) ?? "0"
    );

    // const totalPendingInvoices = formatCurrency(data[2].rows[0].pending ?? "0");

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch card data.");
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  try {
    const { data, error } = await supabase.from("invoices").select(
      `
      id,
      amount,
      date,
      status,
      customers (
        name,
        email,
        image_url
      )
    `
    );
    // .eq("customers.name", `${query}`);

    // try {
    //   const invoices = await sql<InvoicesTable>`
    //     SELECT
    //       invoices.id,
    //       invoices.amount,
    //       invoices.date,
    //       invoices.status,
    //       customers.name,
    //       customers.email,
    //       customers.image_url
    //     FROM invoices
    //     JOIN customers ON invoices.customer_id = customers.id
    //     WHERE
    //       customers.name ILIKE ${`%${query}%`} OR
    //       customers.email ILIKE ${`%${query}%`} OR
    //       invoices.amount::text ILIKE ${`%${query}%`} OR
    //       invoices.date::text ILIKE ${`%${query}%`} OR
    //       invoices.status ILIKE ${`%${query}%`}
    //     ORDER BY invoices.date DESC
    //     LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    //   `;

    return data;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoices.");
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const count = await sql`SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`} OR
      invoices.amount::text ILIKE ${`%${query}%`} OR
      invoices.date::text ILIKE ${`%${query}%`} OR
      invoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch total number of invoices.");
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const { data } = await supabase
      .from("invoices")
      .select("id,customer_id, amount, status")
      .eq("id", id);

    // const invoice = data.rows.map((invoice) => ({
    //   ...invoice,
    //   // Convert amount from cents to dollars
    //   amount: invoice.amount / 100,
    // }));

    return data;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoice.");
  }
}

export async function fetchCustomers() {
  try {
    // const data = await sql<CustomerField>`
    //   SELECT
    //     id,
    //     name
    //   FROM customers
    //   ORDER BY name ASC
    // `;
    const { data } = await supabase.from("customers").select(`id, name`);

    // const customers = data.rows;
    return data;
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch all customers.");
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch customer table.");
  }
}
