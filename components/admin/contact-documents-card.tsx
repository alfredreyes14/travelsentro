"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FileTextIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import {
  confirmDocumentUpload,
  createDocumentUpload,
  deleteDocument,
} from "@/actions/contact-documents";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DOCUMENT_ACCEPT,
  checkDocument,
  formatBytes,
} from "@/lib/crm/documents";

const UPLOAD_ERROR_MESSAGE =
  "Something went wrong uploading. Please try again.";
const DELETE_ERROR_MESSAGE =
  "Something went wrong deleting that document. Please try again.";

export type ContactDocument = {
  id: string;
  fileName: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
};

/**
 * A B2B client's documents. Anyone who can see the contact can open one;
 * uploading and deleting need can_edit_crm. Files travel browser -> R2
 * directly through a presigned URL, then are confirmed with the server.
 */
export function ContactDocumentsCard({
  contactId,
  documents,
  canEdit,
}: {
  contactId: string;
  documents: ContactDocument[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContactDocument | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  async function uploadOne(file: File): Promise<boolean> {
    const fail = (message: string) => {
      toast.error(`${file.name}: ${message}`);
      return false;
    };

    const checked = checkDocument(file);
    if (!checked.ok) return fail(checked.error);

    const started = await createDocumentUpload(contactId, {
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!started.ok) return fail(started.error);

    const put = await fetch(started.url, {
      method: "PUT",
      headers: { "Content-Type": started.contentType },
      body: file,
    });
    if (!put.ok) return fail("The upload failed. Please try again.");

    const confirmed = await confirmDocumentUpload(
      contactId,
      started.key,
      file.name
    );
    if (!confirmed.ok) return fail(confirmed.error);

    return true;
  }

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";

    let uploaded = 0;
    try {
      for (const file of files) {
        setUploadingName(file.name);
        if (await uploadOne(file)) uploaded += 1;
      }
    } catch {
      toast.error(UPLOAD_ERROR_MESSAGE);
    } finally {
      setUploadingName(null);
    }

    if (uploaded > 0) {
      toast.success(
        uploaded === 1 ? "Document uploaded." : `${uploaded} documents uploaded.`
      );
      router.refresh();
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const result = await deleteDocument(pendingDelete.id);
      if (result.ok) {
        toast.success("Document deleted.");
        setPendingDelete(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(DELETE_ERROR_MESSAGE);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Documents</CardTitle>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={DOCUMENT_ACCEPT}
              className="hidden"
              onChange={handleFiles}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={uploadingName !== null}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon />
              {uploadingName !== null ? "Uploading..." : "Upload"}
            </Button>
          </>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">
        {uploadingName !== null ? (
          <p className="pb-2 text-muted-foreground">
            Uploading {uploadingName}...
          </p>
        ) : null}

        {documents.length === 0 ? (
          <p className="text-muted-foreground">
            No documents yet.
            {canEdit
              ? " Upload PDFs, images, Word or Excel files up to 20 MB each."
              : ""}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center gap-3 py-2">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/admin/crm/${contactId}/documents/${document.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {document.fileName}
                  </a>
                  <p className="text-muted-foreground">
                    {formatBytes(document.sizeBytes)} · Uploaded by{" "}
                    {document.uploadedByName ?? "a staff member"} on{" "}
                    {format(new Date(document.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${document.fileName}`}
                    onClick={() => setPendingDelete(document)}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.fileName} will be removed for everyone. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
