import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_PAYLOAD_HASH, encodePath, signV4 } from "../src/utils/s3.js";

// Examples from the AWS documentation «Signature Calculations for the Authorization Header».
const credentials = { accessKey: "AKIAIOSFODNN7EXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" };

test("подпись S3 совпадает с примером AWS: GET объекта", () => {
  const authorization = signV4({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    headers: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9", "x-amz-content-sha256": EMPTY_PAYLOAD_HASH, "x-amz-date": "20130524T000000Z" },
    payloadHash: EMPTY_PAYLOAD_HASH,
    ...credentials
  });
  assert.equal(
    authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"
  );
});

test("подпись S3 совпадает с примером AWS: список объектов с параметрами", () => {
  const authorization = signV4({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J"),
    headers: { host: "examplebucket.s3.amazonaws.com", "x-amz-content-sha256": EMPTY_PAYLOAD_HASH, "x-amz-date": "20130524T000000Z" },
    payloadHash: EMPTY_PAYLOAD_HASH,
    ...credentials
  });
  assert.match(authorization, /Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/);
});

test("путь кодируется по RFC 3986, слэши сохраняются", () => {
  assert.equal(encodePath("/bucket/db/копия (1).sqlite.gz"), "/bucket/db/%D0%BA%D0%BE%D0%BF%D0%B8%D1%8F%20%281%29.sqlite.gz");
});
