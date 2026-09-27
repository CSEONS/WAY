import crypto from "node:crypto";

// Just enough of the S3 API for backups: put, get, list, delete. Works with
// any S3-compatible storage (Yandex Object Storage, Timeweb, Selectel, AWS)
// through Signature Version 4 and path-style URLs: <endpoint>/<bucket>/<key>.

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export const EMPTY_PAYLOAD_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => crypto.createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone). */
function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** "/bucket/some key/file.jpg" → "/bucket/some%20key/file.jpg". */
export function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encode(segment))
    .join("/");
}

export interface SignInput {
  method: string;
  url: URL;
  /** Every header to sign, lower- or mixed-case. Must include x-amz-date and x-amz-content-sha256. */
  headers: Record<string, string>;
  payloadHash: string;
  accessKey: string;
  secretKey: string;
  region: string;
  service?: string;
}

/** The Authorization header for a request (AWS Signature Version 4, header-based). */
export function signV4({ method, url, headers, payloadHash, accessKey, secretKey, region, service = "s3" }: SignInput) {
  const normalized = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = normalized.map(([name]) => name).join(";");
  const amzDate = normalized.find(([name]) => name === "x-amz-date")?.[1];
  if (!amzDate) throw new Error("x-amz-date header is required");
  const day = amzDate.slice(0, 8);

  const query = [...url.searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const canonicalRequest = [
    method,
    url.pathname || "/",
    query,
    normalized.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaders,
    payloadHash
  ].join("\n");

  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), service), "aws4_request");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function amzDateNow() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export class S3Client {
  constructor(private readonly config: S3Config) {}

  private url(key: string, query?: Record<string, string>) {
    const url = new URL(this.config.endpoint.replace(/\/+$/, ""));
    url.pathname = encodePath(`/${this.config.bucket}${key ? `/${key}` : ""}`);
    // Built by hand: URLSearchParams writes spaces as "+", the signature expects "%20".
    url.search = Object.entries(query ?? {})
      .map(([name, value]) => `${encode(name)}=${encode(value)}`)
      .join("&");
    return url;
  }

  private async request(method: string, url: URL, body?: Buffer, extraHeaders: Record<string, string> = {}) {
    const payloadHash = body ? sha256(body) : EMPTY_PAYLOAD_HASH;
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDateNow(),
      ...extraHeaders
    };
    const authorization = signV4({ method, url, headers, payloadHash, ...this.config });
    const { host: _host, ...sendHeaders } = headers;
    const response = await fetch(url, {
      method,
      headers: { ...sendHeaders, Authorization: authorization },
      body: body ? new Uint8Array(body) : undefined,
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
      throw new Error(`S3 ${method} ${url.pathname} failed: ${response.status}${code ? ` ${code}` : ""}`);
    }
    return response;
  }

  async put(key: string, body: Buffer, contentType = "application/octet-stream") {
    await this.request("PUT", this.url(key), body, { "content-type": contentType });
  }

  async get(key: string) {
    const response = await this.request("GET", this.url(key));
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string) {
    await this.request("DELETE", this.url(key));
  }

  /** Every object under a prefix (follows pagination). */
  async list(prefix: string) {
    const objects: { key: string; size: number; lastModified: string }[] = [];
    let token: string | undefined;
    do {
      const query: Record<string, string> = { "list-type": "2", prefix };
      if (token) query["continuation-token"] = token;
      const xml = await (await this.request("GET", this.url("", query))).text();
      for (const [, block] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = /<Key>([^<]*)<\/Key>/.exec(block)?.[1];
        if (!key) continue;
        objects.push({
          key: decodeXml(key),
          size: Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? 0),
          lastModified: /<LastModified>([^<]*)<\/LastModified>/.exec(block)?.[1] ?? ""
        });
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? decodeXml(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? "") : undefined;
    } while (token);
    return objects;
  }
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
