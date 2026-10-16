"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  BLOG_KIND_LABEL,
  BLOG_KINDS,
  BLOG_PEOPLE_MAX,
  BLOG_PERSON_NAME_MAX,
  BLOG_PERSON_PLACE_MAX,
  type BlogKind,
  type BlogPerson,
} from "@/lib/blog";

/**
 * Who a library post is about (Step 135): an individual, a couple or a
 * family, and each one's name and place of birth. The admin page's editor
 * draws it, and since Step 157 so does the form for sending a story in.
 */

const EMPTY_PERSON: BlogPerson = { first: "", last: "", maiden: "", place: "" };

/** The rows a kind needs: one for a person, two for a couple, at least one for a family. */
function peopleFor(kind: BlogKind, people: BlogPerson[]): BlogPerson[] {
  const want =
    kind === "person" ? 1 : kind === "couple" ? 2 : Math.max(1, people.length);
  const next = people.slice(0, kind === "family" ? BLOG_PEOPLE_MAX : want);
  while (next.length < want) next.push({ ...EMPTY_PERSON });
  return next;
}

export type About = ReturnType<typeof useAbout>;

/** The kind, its people, and which one's fields show. */
export function useAbout(initialKind: BlogKind = "person", initialPeople: BlogPerson[] = []) {
  const [kind, setKind] = React.useState<BlogKind>(initialKind);
  const [people, setPeople] = React.useState<BlogPerson[]>(() =>
    peopleFor(initialKind, initialPeople),
  );
  const [shown, setShown] = React.useState(0);

  function changeKind(next: BlogKind) {
    setKind(next);
    setPeople((p) => peopleFor(next, p));
    setShown(0);
  }

  function addPerson() {
    setPeople((p) => [...p, { ...EMPTY_PERSON }]);
    setShown(people.length);
  }

  function removePerson(index: number) {
    setPeople((p) => p.filter((_, j) => j !== index));
    setShown((i) => Math.max(0, Math.min(i, people.length - 2)));
  }

  function setPerson(index: number, field: keyof BlogPerson, value: string) {
    setPeople((p) =>
      p.map((person, i) => (i === index ? { ...person, [field]: value } : person)),
    );
  }

  return { kind, people, shown, setShown, changeKind, addPerson, removePerson, setPerson };
}

/**
 * The kinds beside one person's fields, in a small container whose toggles
 * ("person 1", "person 2" …) are always there, so the form doesn't move
 * when a couple or a family is picked.
 */
export function AboutFields({
  idPrefix,
  about,
  disabled,
}: {
  idPrefix: string;
  about: About;
  disabled: boolean;
}) {
  const { kind, people, shown } = about;
  return (
    <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">About</legend>
        <RadioGroup
          value={kind}
          onValueChange={(v) => about.changeKind(v as BlogKind)}
          className="flex flex-row flex-wrap gap-x-4 gap-y-2 sm:flex-col"
          disabled={disabled}
        >
          {BLOG_KINDS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={k} />
              {BLOG_KIND_LABEL[k]}
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <PersonFields
        idPrefix={`${idPrefix}-person-${shown}`}
        person={people[shown] ?? people[0]}
        onChange={(field, value) => about.setPerson(shown, field, value)}
        tabs={{
          count: people.length,
          shown,
          onShow: about.setShown,
          onAdd:
            kind === "family" && people.length < BLOG_PEOPLE_MAX
              ? about.addPerson
              : undefined,
          onRemove:
            kind === "family" && people.length > 1
              ? () => about.removePerson(shown)
              : undefined,
        }}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * One person's fields under the toggles; a couple or a family switch
 * between their people with them, and a family adds and removes them
 * there too.
 */
function PersonFields({
  idPrefix,
  person,
  onChange,
  tabs,
  disabled,
}: {
  idPrefix: string;
  person: BlogPerson;
  onChange: (field: keyof BlogPerson, value: string) => void;
  tabs: {
    count: number;
    shown: number;
    onShow: (index: number) => void;
    onAdd?: () => void;
    onRemove?: () => void;
  };
  disabled: boolean;
}) {
  const field = (key: keyof BlogPerson, label: string, max: number) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`${idPrefix}-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`${idPrefix}-${key}`}
        value={person[key]}
        onChange={(e) => onChange(key, e.target.value)}
        maxLength={max}
        disabled={disabled}
        autoComplete="off"
        className="h-8"
      />
    </div>
  );
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-1">
        <div
          role="group"
          aria-label="Person"
          className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
        >
          {Array.from({ length: tabs.count }, (_, i) => (
            <Button
              key={i}
              type="button"
              size="sm"
              variant={i === tabs.shown ? "default" : "ghost"}
              aria-pressed={i === tabs.shown}
              disabled={disabled}
              onClick={() => tabs.onShow(i)}
              className="h-7 px-2"
            >
              person {i + 1}
            </Button>
          ))}
          {tabs.onAdd ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Add a person"
              disabled={disabled}
              onClick={tabs.onAdd}
              className="h-7 px-2"
            >
              +
            </Button>
          ) : null}
        </div>
        {tabs.onRemove ? (
          <button
            type="button"
            onClick={tabs.onRemove}
            disabled={disabled}
            className="ml-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {field("first", "First name", BLOG_PERSON_NAME_MAX)}
        {field("last", "Last name", BLOG_PERSON_NAME_MAX)}
        {field("maiden", "Maiden name", BLOG_PERSON_NAME_MAX)}
        {field("place", "Place of birth", BLOG_PERSON_PLACE_MAX)}
      </div>
    </div>
  );
}
