function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  appUrl: optional("APP_URL", "http://localhost:3000"),
  sessionSecret: optional("SESSION_SECRET", "dev-session-secret-change-me"),
  tokenEncryptionKey: optional(
    "TOKEN_ENCRYPTION_KEY",
    "dev-token-encryption-key-32b!",
  ),
  nodeEnv: optional("NODE_ENV", "development"),
  isProd: process.env.NODE_ENV === "production",

  sms: {
    apiUrl: optional("SMS_API_URL"),
    apiKey: optional("SMS_API_KEY"),
    senderId: optional("SMS_SENDER_ID"),
    devMode:
      optional("SMS_DEV_MODE", "true") === "true" ||
      !optional("SMS_API_URL"),
    otpExpiryMinutes: Number(optional("OTP_EXPIRY_MINUTES", "5")),
  },

  s3: {
    region: optional("S3_REGION", "auto"),
    endpoint: optional("S3_ENDPOINT") || undefined,
    accessKey: optional("S3_ACCESS_KEY"),
    secretKey: optional("S3_SECRET_KEY"),
    bucket: optional("S3_BUCKET", "xcall-kyc"),
    forcePathStyle: optional("S3_FORCE_PATH_STYLE", "true") === "true",
    publicBaseUrl: optional("S3_PUBLIC_BASE_URL").replace(/\/$/, ""),
  },

  selx: {
    baseUrl: optional("SELX_BASE_URL").replace(/\/$/, ""),
    partnerApiKey: optional("SELX_PARTNER_API_KEY"),
    partnerWebhookSecret: optional("SELX_PARTNER_WEBHOOK_SECRET"),
    defaultBridgeNumber: optional("SELX_DEFAULT_BRIDGE_NUMBER"),
  },

  payment: {
    mode: optional("PAYMENT_MODE", "mock") as "mock" | "webhook",
    webhookSecret: optional("PAYMENT_WEBHOOK_SECRET", "dev-payment-secret"),
  },

  admin: {
    phone: optional("ADMIN_PHONE"),
    password: optional("ADMIN_PASSWORD"),
    name: optional("ADMIN_NAME", "Portal Admin"),
  },
};

export function assertServerEnv() {
  required("DATABASE_URL", process.env.DATABASE_URL);
}
