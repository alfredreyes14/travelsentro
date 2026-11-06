import "server-only";

import { renderSoaPdf, type StatementForPdf } from "@/lib/pdf/soa-pdf";
import { statementToPrintValues } from "@/lib/soa/soa-row";
import { getPrivateObjectBytes } from "@/lib/storage/r2-private";

/** The extension a stored file name should end with, from its content type. */
function withExtension(fileName: string, fallbackExt: string): string {
  return /\.[a-z0-9]{2,5}$/i.test(fileName) ? fileName : `${fileName}.${fallbackExt}`;
}

/**
 * The file an SOA is sent or downloaded as: a previous SOA's own uploaded
 * file when it has one, otherwise the SOA PDF.
 */
export async function buildSoaAttachment(
  soa: StatementForPdf,
  logoSrc: string
): Promise<{ filename: string; content: Buffer; contentType: string }> {
  if (soa.file_storage_key && soa.file_name && soa.file_content_type) {
    const bytes = await getPrivateObjectBytes(soa.file_storage_key);
    const ext = soa.file_storage_key.split(".").pop() ?? "pdf";
    return {
      filename: withExtension(soa.file_name, ext),
      content: Buffer.from(bytes),
      contentType: soa.file_content_type,
    };
  }

  const content = await renderSoaPdf(
    { soaNo: soa.soa_no, quoteNo: soa.quoteNo, values: statementToPrintValues(soa) },
    logoSrc
  );
  return { filename: `${soa.soa_no}.pdf`, content, contentType: "application/pdf" };
}
