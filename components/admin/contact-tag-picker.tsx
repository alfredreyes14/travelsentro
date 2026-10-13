"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTags } from "@/lib/crm/tags";

/**
 * Tags for one contact. Typing filters the tags already in use so staff
 * reuse them; a tag that doesn't exist yet is created with Enter, a comma,
 * or the "Create" suggestion.
 */
export function ContactTagPicker({
  id,
  value,
  onChange,
  existingTags,
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  existingTags: string[];
}) {
  const [draft, setDraft] = useState("");

  const atLimit = value.length >= MAX_TAGS;
  const query = draft.trim().toLowerCase();
  const selected = new Set(value.map((tag) => tag.toLowerCase()));
  const suggestions = existingTags
    .filter(
      (tag) =>
        !selected.has(tag.toLowerCase()) && tag.toLowerCase().includes(query)
    )
    .slice(0, 12);
  const isNew =
    query !== "" &&
    !selected.has(query) &&
    !existingTags.some((tag) => tag.toLowerCase() === query);

  function add(tag: string) {
    if (atLimit) return;
    onChange(normalizeTags([...value, tag], existingTags));
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter must never submit the surrounding form from this field.
      event.preventDefault();
      if (draft.trim()) add(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <Badge key={tag} variant="outline" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="rounded-full p-0.5 hover:bg-muted"
                onClick={() => remove(tag)}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_TAG_LENGTH}
        disabled={atLimit}
        placeholder={
          atLimit
            ? `Up to ${MAX_TAGS} tags`
            : "Type to find a tag or create one"
        }
        autoComplete="off"
      />

      {!atLimit && (suggestions.length > 0 || isNew) ? (
        <div className="flex flex-wrap gap-1">
          {isNew ? (
            <button type="button" onClick={() => add(draft)}>
              <Badge variant="secondary">Create “{draft.trim()}”</Badge>
            </button>
          ) : null}
          {suggestions.map((tag) => (
            <button key={tag} type="button" onClick={() => add(tag)}>
              <Badge variant="outline" className="hover:bg-muted">
                + {tag}
              </Badge>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
