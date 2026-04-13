import crypto from "crypto";

//кодируем номер карты
export function encryptPan(pan: string, cardKey: Buffer): string {
  const iv = crypto.randomBytes(12); //соль
  const cipher = crypto.createCipheriv("aes-256-gcm", cardKey, iv); //шифратор(ключ в байтовом виде + соль)

  const encrypted = Buffer.concat([cipher.update(pan, "utf8"), cipher.final()]); //шифруем номер карты
  const authTag = cipher.getAuthTag(); //считаем подпись - защита от подмены

  return [
    iv.toString("hex"),
    encrypted.toString("hex"),
    authTag.toString("hex"),
  ].join(":");
}
