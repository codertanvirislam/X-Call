import { createHmac } from "crypto";
import { env } from "./env";

/**
 * EPS (pgapi.eps.com.bd) payment gateway client.
 *
 * Flow: getToken -> initPayment (returns a hosted RedirectURL) -> user pays on
 * EPS -> EPS redirects back to our callback -> we re-verify with
 * getTransactionStatus (never trust the redirect params) before marking paid.
 */

const TOKEN_PATH = "/v1/Auth/GetToken";
const INIT_PATH = "/v1/EPSEngine/InitializeEPS";
const VERIFY_PATH = "/v1/EPSEngine/CheckMerchantTransactionStatus";

const TX_TYPE_WEB = 1;

/** x-hash header = base64( HMAC-SHA512(HASH_KEY, data) ). */
function epsHash(data: string): string {
  return createHmac("sha512", env.eps.hashKey).update(data, "utf8").digest("base64");
}

function url(path: string): string {
  return `${env.eps.baseUrl}${path}`;
}

export function isEpsConfigured(): boolean {
  return Boolean(
    env.eps.username &&
      env.eps.password &&
      env.eps.hashKey &&
      env.eps.merchantId &&
      env.eps.storeId,
  );
}

async function getToken(): Promise<string> {
  const res = await fetch(url(TOKEN_PATH), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hash": epsHash(env.eps.username),
    },
    body: JSON.stringify({
      userName: env.eps.username,
      password: env.eps.password,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`EPS token failed (${res.status}): ${text}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`EPS token: invalid JSON response: ${text}`);
  }
  const token = (data as { token?: string; Token?: string })?.token ??
    (data as { Token?: string })?.Token;
  if (!token) {
    throw new Error(`EPS token missing in response: ${text}`);
  }
  return token;
}

export type EpsInitParams = {
  merchantTransactionId: string;
  customerOrderId: string;
  amountBdt: number;
  productName: string;
  productCategory: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipAddress?: string;
};

export type EpsInitResult = {
  redirectUrl: string;
  transactionId: string;
};

export async function initPayment(params: EpsInitParams): Promise<EpsInitResult> {
  const token = await getToken();

  const body = {
    merchantId: env.eps.merchantId,
    storeId: env.eps.storeId,
    CustomerOrderId: params.customerOrderId,
    merchantTransactionId: params.merchantTransactionId,
    transactionTypeId: TX_TYPE_WEB,
    totalAmount: params.amountBdt,
    successUrl: params.successUrl,
    failUrl: params.failUrl,
    cancelUrl: params.cancelUrl,
    customerName: params.customer.name,
    customerEmail: params.customer.email,
    customerPhone: params.customer.phone,
    customerAddress: params.customer.address,
    customerCity: params.customer.city,
    customerState: params.customer.state,
    customerPostcode: params.customer.postcode,
    customerCountry: params.customer.country,
    productName: params.productName,
    productProfile: "non-physical-goods",
    productCategory: params.productCategory,
    ipAddress: params.ipAddress,
    version: "1",
    ProductList: [
      {
        ProductName: params.productName,
        NoOfItem: "1",
        ProductProfile: "non-physical-goods",
        ProductCategory: params.productCategory,
        ProductPrice: String(params.amountBdt),
      },
    ],
  };

  const res = await fetch(url(INIT_PATH), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hash": epsHash(params.merchantTransactionId),
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`EPS init: invalid JSON response (${res.status}): ${text}`);
  }

  const errorMessage = (data.ErrorMessage as string) || "";
  const redirectUrl = (data.RedirectURL as string) || "";
  if (!res.ok || errorMessage || !redirectUrl) {
    throw new Error(
      `EPS init failed: ${errorMessage || `status ${res.status}`} ${text}`.trim(),
    );
  }

  return {
    redirectUrl,
    transactionId: (data.TransactionId as string) || "",
  };
}

export type EpsTransactionStatus = {
  status: string; // lowercased, e.g. "success" | "failed" | "cancelled" | "pending"
  isSuccess: boolean;
  merchantTransactionId: string;
  epsTransactionId: string;
  totalAmount: string;
  raw: Record<string, unknown>;
};

export async function getTransactionStatus(
  merchantTransactionId: string,
): Promise<EpsTransactionStatus> {
  const token = await getToken();

  const res = await fetch(
    `${url(VERIFY_PATH)}?merchantTransactionId=${encodeURIComponent(merchantTransactionId)}`,
    {
      method: "GET",
      headers: {
        "x-hash": epsHash(merchantTransactionId),
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`EPS verify failed (${res.status}): ${text}`);
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`EPS verify: invalid JSON response: ${text}`);
  }

  const status = String(data.Status ?? data.status ?? "").toLowerCase();

  return {
    status,
    isSuccess: status === "success",
    merchantTransactionId:
      (data.MerchantTransactionId as string) || merchantTransactionId,
    epsTransactionId: (data.EPSTransactionId as string) || "",
    totalAmount: String(data.TotalAmount ?? ""),
    raw: data,
  };
}
