"use client";

import * as React from "react";
import {
  useFormContext,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

import { Plus } from "lucide-react";

import { AncestralLandsField } from "@/components/ancestral-lands";
import { DateField } from "@/components/date-field";
import {
  PlaceAutocomplete,
  type SelectedPlace,
} from "@/components/place-autocomplete";
import { placeText } from "@/lib/place-choice";
import { preferredCopiesFirst } from "@/lib/person-name";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  SEX_LABELS,
  SEX_VALUES,
  LINEAGE_LABELS,
  LINEAGE_TYPES,
} from "@/lib/person-schema";

/** The mark on a label whose field has to be filled in. */
function RequiredMark() {
  return (
    <span aria-hidden className="-ml-1.5 text-destructive">
      *
    </span>
  );
}

/**
 * Which fields to show, by name (`first_name`, `place_of_birth`,
 * `date_of_death`…), or every one when left out. Filling in what's missing
 * (Step 44) shows only the empty ones (`lib/fill-blanks#blankFields`).
 */
type FieldFilter = ReadonlySet<string> | undefined;

function shows(filter: FieldFilter, field: string): boolean {
  return !filter || filter.has(field);
}

/** A field's path, standalone or as one row of a `people[]` field array. */
function useFieldName<T extends FieldValues>(prefix?: string) {
  return React.useCallback(
    (field: string) => (prefix ? `${prefix}.${field}` : field) as Path<T>,
    [prefix],
  );
}

/**
 * Names only some people have, offered as links rather than boxes (Step 44):
 * offered as fields, the first name gets typed into all of them. The maiden
 * name joined them from the details below (Step 58). `selfAutoComplete` is
 * for the member's own entry only (`self`).
 */
const EXTRA_NAMES = [
  {
    key: "middle_name",
    label: "Middle name",
    selfAutoComplete: "additional-name",
  },
  {
    key: "preferred_name",
    label: "Preferred name",
    selfAutoComplete: "nickname",
  },
  // Not "family-name": that would fill in the member's own.
  { key: "maiden_name", label: "Maiden name", selfAutoComplete: "off" },
] as const;
type ExtraName = (typeof EXTRA_NAMES)[number]["key"];

/**
 * A person's names: first and last, with a middle, a preferred and a maiden
 * name to reach for. All the add-a-relative form asks up front (Step 44).
 */
export function PersonNameFields<T extends FieldValues>({
  control,
  prefix,
  show,
  required = true,
  self = false,
}: {
  control: Control<T>;
  prefix?: string;
  show?: FieldFilter;
  /** Mark what has to be filled in. Filling in what's missing marks nothing:
   *  the entry already has its name. */
  required?: boolean;
  /**
   * The member's own entry, so the browser may fill in their names. Anyone
   * else's names are `off`, or it offers the member's own name for every
   * relative (Step 61).
   */
  self?: boolean;
}) {
  const { setValue, getValues } = useFormContext<T>();
  const name = useFieldName<T>(prefix);
  const preferredName = useWatch({ control, name: name("preferred_name") });

  // The extra names are there to reach for, not boxes to fill. One that
  // already holds a name is shown.
  const [extraNames, setExtraNames] = React.useState(
    () =>
      Object.fromEntries(
        EXTRA_NAMES.map(({ key }) => [
          key,
          Boolean(String(getValues(name(key)) ?? "").trim()),
        ]),
      ) as Record<ExtraName, boolean>,
  );
  const [justRevealed, setJustRevealed] = React.useState<string | null>(null);
  const reveal = (field: ExtraName) => {
    setExtraNames((shown) => ({ ...shown, [field]: true }));
    setJustRevealed(field);
  };
  const offers = (field: ExtraName) => shows(show, field) && !extraNames[field];

  if (
    !["first_name", "last_name", ...EXTRA_NAMES.map(({ key }) => key)].some(
      (f) => shows(show, f),
    )
  ) {
    return null;
  }

  return (
    <>
      {required ? (
        <p className="text-xs text-muted-foreground">
          <span aria-hidden className="text-destructive">
            *
          </span>{" "}
          Required
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {shows(show, "first_name") ? (
          <FormField
            control={control}
            name={name("first_name")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  First name
                  {!required || String(preferredName ?? "").trim() ? null : (
                    <RequiredMark />
                  )}
                </FormLabel>
                <FormControl>
                  <Input
                    autoComplete={self ? "given-name" : "off"}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      // A preferred name that only repeats the first name
                      // follows it, or the card keeps showing the old spelling.
                      const preferred = getValues(name("preferred_name"));
                      if (preferredCopiesFirst(preferred, field.value)) {
                        setValue(
                          name("preferred_name"),
                          e.target.value as never,
                          { shouldDirty: true },
                        );
                      }
                      field.onChange(e);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {shows(show, "last_name") ? (
          <FormField
            control={control}
            name={name("last_name")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Last name
                  {required ? <RequiredMark /> : null}
                </FormLabel>
                <FormControl>
                  <Input
                    autoComplete={self ? "family-name" : "off"}
                    required={required}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {EXTRA_NAMES.map(({ key, label, selfAutoComplete }) =>
          shows(show, key) && extraNames[key] ? (
            <FormField
              key={key}
              control={control}
              name={name(key)}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete={self ? selfAutoComplete : "off"}
                      autoFocus={justRevealed === key}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null,
        )}
        {EXTRA_NAMES.some(({ key }) => offers(key)) ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 sm:col-span-2">
            {EXTRA_NAMES.map(({ key, label }) =>
              offers(key) ? (
                <Button
                  key={key}
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0"
                  onClick={() => reveal(key)}
                >
                  <Plus />
                  {label}
                </Button>
              ) : null,
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Whether they've died. The add-a-relative form asks it up front, since
 *  nobody is invited to take over the entry of someone who has (Step 44). */
export function PersonDiedField<T extends FieldValues>({
  control,
  prefix,
  idPrefix,
}: {
  control: Control<T>;
  prefix?: string;
  idPrefix: string;
}) {
  const name = useFieldName<T>(prefix);
  return (
    <FormField
      control={control}
      name={name("is_deceased")}
      render={({ field }) => (
        <FormItem className="flex-row items-center gap-3">
          <FormControl>
            <Checkbox
              id={`${idPrefix}-is-deceased`}
              checked={field.value ?? false}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          </FormControl>
          <FormLabel
            htmlFor={`${idPrefix}-is-deceased`}
            className="font-normal"
          >
            This person is deceased
          </FormLabel>
        </FormItem>
      )}
    />
  );
}

/**
 * Everything about a person past their names: sex, birth, and death once
 * they're marked as having died; the contact block and lineage when asked
 * for. Labels only, with no line under a field explaining it (Step 58).
 */
export function PersonDetailFields<T extends FieldValues>({
  control,
  isAdmin,
  withContact = false,
  withDiedField = false,
  prefix,
  idPrefix,
  placeLabels,
  lineage,
  show,
}: {
  control: Control<T>;
  isAdmin: boolean;
  /**
   * Show the contact block (email, and whether other members see it): for
   * the entry's owner editing it. The add flow leaves it for later.
   */
  withContact?: boolean;
  /** Ask whether they've died, between birth and death. Left out where the
   *  question is asked up front, or isn't anyone's to answer. */
  withDiedField?: boolean;
  prefix?: string;
  idPrefix: string;
  /** Labels for already-selected places, so the edit form shows them on load. */
  placeLabels?: { birth?: string | null; death?: string | null };
  /**
   * Offer the lineage choice (a Root's, about the link to this person's
   * parent). Defaults to `isAdmin`; the first run's family step asks it only
   * about a child, whose parent is the founder adding them (Step 29).
   */
  lineage?: boolean;
  show?: FieldFilter;
}) {
  const { setValue } = useFormContext<T>();
  const name = useFieldName<T>(prefix);

  const isDeceased = useWatch({ control, name: name("is_deceased") });
  const placeIdBirth = useWatch({ control, name: name("place_id_birth") });
  const placeIdDeath = useWatch({ control, name: name("place_id_death") });

  const setPlace = React.useCallback(
    (kind: "birth" | "death", place: SelectedPlace | null) => {
      // A whole country leaves the town empty (Step 79).
      const text = place ? placeText(place) : null;
      const idField = kind === "birth" ? "place_id_birth" : "place_id_death";
      const textField = kind === "birth" ? "city_of_birth" : "place_of_death";
      setValue(name(idField), (place?.id ?? null) as never, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue(
        name(textField),
        ((kind === "birth" ? text?.city : text?.label) ?? "") as never,
        { shouldDirty: true },
      );
      if (kind === "birth") {
        setValue(name("country_of_birth"), (text?.country ?? "") as never, {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    },
    [name, setValue],
  );

  const showsDeath =
    Boolean(isDeceased) &&
    (shows(show, "date_of_death") || shows(show, "place_of_death"));

  return (
    <>
      {shows(show, "sex") ? (
        <FormField
          control={control}
          name={name("sex")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sex</FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value ?? null}
                  onValueChange={(v) => field.onChange(v || undefined)}
                >
                  {SEX_VALUES.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-3 text-sm font-normal"
                    >
                      <RadioGroupItem value={s} />
                      {SEX_LABELS[s]}
                    </label>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}

      {shows(show, "date_of_birth") ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name={name("date_of_birth")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date of birth</FormLabel>
                <FormControl>
                  <DateField
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ) : null}

      {shows(show, "place_of_birth") ? (
        <>
          <FormField
            control={control}
            name={name("place_id_birth")}
            render={({ fieldState }) => (
              <FormItem>
                <FormLabel htmlFor={`${idPrefix}-place-birth`}>
                  Place of birth
                </FormLabel>
                <FormControl>
                  <PlaceAutocomplete
                    id={`${idPrefix}-place-birth`}
                    value={
                      typeof placeIdBirth === "number" ? placeIdBirth : null
                    }
                    initialLabel={placeLabels?.birth}
                    isAdmin={isAdmin}
                    invalid={Boolean(fieldState.error)}
                    placeholder="Search for a town, village, or country…"
                    onChange={(place) => setPlace("birth", place)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {typeof placeIdBirth === "number" ? (
            <AncestralLandsField placeId={placeIdBirth} />
          ) : null}
        </>
      ) : null}

      {withDiedField ? (
        <PersonDiedField control={control} prefix={prefix} idPrefix={idPrefix} />
      ) : null}

      {showsDeath ? (
        <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
          {shows(show, "date_of_death") ? (
            <FormField
              control={control}
              name={name("date_of_death")}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of death</FormLabel>
                  <FormControl>
                    <DateField
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
          {shows(show, "place_of_death") ? (
            <>
              <FormField
                control={control}
                name={name("place_id_death")}
                render={() => (
                  <FormItem>
                    <FormLabel htmlFor={`${idPrefix}-place-death`}>
                      Place of death
                    </FormLabel>
                    <FormControl>
                      <PlaceAutocomplete
                        id={`${idPrefix}-place-death`}
                        value={
                          typeof placeIdDeath === "number" ? placeIdDeath : null
                        }
                        initialLabel={placeLabels?.death}
                        isAdmin={isAdmin}
                        placeholder="Search for a place…"
                        onChange={(place) => setPlace("death", place)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {typeof placeIdDeath === "number" ? (
                <AncestralLandsField
                  placeId={placeIdDeath}
                  className="sm:col-span-2"
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {withContact ? (
        <div className="grid gap-4 rounded-lg border border-border p-4">
          <FormField
            control={control}
            name={name("email")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={name("email_visible")}
            render={({ field }) => (
              <FormItem className="flex-row items-center gap-3">
                <FormControl>
                  <Checkbox
                    id={`${idPrefix}-email-visible`}
                    checked={field.value ?? false}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                </FormControl>
                <FormLabel
                  htmlFor={`${idPrefix}-email-visible`}
                  className="font-normal"
                >
                  Show this email to other members of the tree
                </FormLabel>
              </FormItem>
            )}
          />
        </div>
      ) : null}

      {(lineage ?? isAdmin) ? (
        <FormField
          control={control}
          name={name("lineage_type")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lineage</FormLabel>
              <Select
                // Without its labels, the closed button shows the stored key.
                items={LINEAGE_LABELS}
                // null, not undefined: "not set" still counts as controlled,
                // so picking one doesn't flip the Select to controlled.
                value={field.value ?? null}
                onValueChange={(v) => field.onChange(v || undefined)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LINEAGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {LINEAGE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </>
  );
}

/**
 * The shared demographic fieldset for a single person. Works standalone
 * (`prefix` omitted) or as one row of a `people[]` field array (`prefix`
 * e.g. `"people.2"`).
 */
export function PersonFields<T extends FieldValues>({
  control,
  isAdmin,
  withContact = false,
  self = false,
  prefix,
  idPrefix,
  placeLabels,
  lineage,
}: {
  control: Control<T>;
  isAdmin: boolean;
  /**
   * Show the contact block (email, and whether other members see it): for
   * the entry's owner editing it. The add flow leaves it for later.
   */
  withContact?: boolean;
  /**
   * The member's own entry: the browser may fill in their names
   * (`PersonNameFields`). Not `withContact`: a member also owns the entries
   * of relatives they added, until those relatives claim them.
   */
  self?: boolean;
  prefix?: string;
  idPrefix: string;
  /** Labels for already-selected places, so the edit form shows them on load. */
  placeLabels?: { birth?: string | null; death?: string | null };
  /**
   * Offer the lineage choice (a Root's, about the link to this person's
   * parent). Defaults to `isAdmin`; the first run's family step asks it only
   * about a child, whose parent is the founder adding them (Step 29).
   */
  lineage?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PersonNameFields control={control} prefix={prefix} self={self} />
      <PersonDetailFields
        control={control}
        isAdmin={isAdmin}
        withContact={withContact}
        withDiedField
        prefix={prefix}
        idPrefix={idPrefix}
        placeLabels={placeLabels}
        lineage={lineage}
      />
    </div>
  );
}
