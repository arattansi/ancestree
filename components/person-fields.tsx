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
import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { countryName } from "@/lib/country-names";
import { preferredCopiesFirst } from "@/lib/person-name";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
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
import { SEX_LABELS, SEX_VALUES, LINEAGE_TYPES } from "@/lib/person-schema";

/** The mark on a label whose field has to be filled in. */
function RequiredMark() {
  return (
    <span aria-hidden className="-ml-1.5 text-destructive">
      *
    </span>
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
  prefix,
  idPrefix,
  placeLabels,
}: {
  control: Control<T>;
  isAdmin: boolean;
  /**
   * Show the contact block (email, and whether other members see it): for
   * the entry's owner editing it. The add flow leaves it for later.
   */
  withContact?: boolean;
  prefix?: string;
  idPrefix: string;
  /** Labels for already-selected places, so the edit form shows them on load. */
  placeLabels?: { birth?: string | null; death?: string | null };
}) {
  const { setValue, getValues } = useFormContext<T>();
  const name = React.useCallback(
    (field: string) => (prefix ? `${prefix}.${field}` : field) as Path<T>,
    [prefix],
  );

  const isDeceased = useWatch({ control, name: name("is_deceased") });
  const placeIdBirth = useWatch({ control, name: name("place_id_birth") });
  const placeIdDeath = useWatch({ control, name: name("place_id_death") });
  const preferredName = useWatch({ control, name: name("preferred_name") });

  // A middle and a preferred name are there to reach for, not boxes to fill:
  // offered as fields, the first name gets typed into all of them. One that
  // already holds a name is shown.
  const [extraNames, setExtraNames] = React.useState(() => ({
    middle_name: Boolean(String(getValues(name("middle_name")) ?? "").trim()),
    preferred_name: Boolean(
      String(getValues(name("preferred_name")) ?? "").trim(),
    ),
  }));
  const [justRevealed, setJustRevealed] = React.useState<string | null>(null);
  const reveal = (field: "middle_name" | "preferred_name") => {
    setExtraNames((shown) => ({ ...shown, [field]: true }));
    setJustRevealed(field);
  };

  const setPlace = React.useCallback(
    (
      kind: "birth" | "death",
      place: { id: number; name: string; country_code: string | null } | null,
    ) => {
      const label = place
        ? [place.name, countryName(place.country_code)]
            .filter(Boolean)
            .join(", ")
        : "";
      const idField = kind === "birth" ? "place_id_birth" : "place_id_death";
      const textField = kind === "birth" ? "city_of_birth" : "place_of_death";
      // Words about whose land the old place was don't describe a new one.
      if ((place?.id ?? null) !== (getValues(name(idField)) ?? null)) {
        setValue(
          name(kind === "birth" ? "ancestral_lands_birth" : "ancestral_lands_death"),
          "" as never,
          { shouldDirty: true },
        );
      }
      setValue(name(idField), (place?.id ?? null) as never, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue(
        name(textField),
        (kind === "birth" ? (place?.name ?? "") : label) as never,
        { shouldDirty: true },
      );
      if (kind === "birth") {
        setValue(
          name("country_of_birth"),
          (place
            ? countryName(place.country_code) || place.country_code || ""
            : "") as never,
          { shouldValidate: true, shouldDirty: true },
        );
      }
    },
    [name, setValue, getValues],
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        <span aria-hidden className="text-destructive">
          *
        </span>{" "}
        Required
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name={name("first_name")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                First name
                {String(preferredName ?? "").trim() ? null : <RequiredMark />}
              </FormLabel>
              <FormControl>
                <Input
                  autoComplete="given-name"
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
        <FormField
          control={control}
          name={name("last_name")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Last name
                <RequiredMark />
              </FormLabel>
              <FormControl>
                <Input
                  autoComplete="family-name"
                  required
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {extraNames.middle_name ? (
          <FormField
            control={control}
            name={name("middle_name")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Middle name</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="additional-name"
                    autoFocus={justRevealed === "middle_name"}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {extraNames.preferred_name ? (
          <FormField
            control={control}
            name={name("preferred_name")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred name</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="nickname"
                    autoFocus={justRevealed === "preferred_name"}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  Shown on the tree in place of the first name.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {extraNames.middle_name && extraNames.preferred_name ? null : (
          <div className="flex flex-wrap gap-x-4 gap-y-1 sm:col-span-2">
            {extraNames.middle_name ? null : (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0"
                onClick={() => reveal("middle_name")}
              >
                <Plus />
                Middle name
              </Button>
            )}
            {extraNames.preferred_name ? null : (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0"
                onClick={() => reveal("preferred_name")}
              >
                <Plus />
                Preferred name
              </Button>
            )}
          </div>
        )}
      </div>

      <FormField
        control={control}
        name={name("maiden_name")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Maiden name</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormDescription>
              Optional. A last name at birth, before any change on marriage.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

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
              <FormDescription>A year on its own is fine.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={name("place_id_birth")}
        render={({ fieldState }) => (
          <FormItem>
            <FormLabel htmlFor={`${idPrefix}-place-birth`}>
              Place of birth
              <RequiredMark />
            </FormLabel>
            <FormControl>
              <PlaceAutocomplete
                id={`${idPrefix}-place-birth`}
                value={typeof placeIdBirth === "number" ? placeIdBirth : null}
                initialLabel={placeLabels?.birth}
                isAdmin={isAdmin}
                invalid={Boolean(fieldState.error)}
                placeholder="Search for a city, town, or village…"
                onChange={(place) => setPlace("birth", place)}
              />
            </FormControl>
            <FormDescription>
              Pick the closest match — you can’t enter a place that isn’t
              listed.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {typeof placeIdBirth === "number" ? (
        <AncestralLandsField
          control={control}
          name={name("ancestral_lands_birth")}
          placeId={placeIdBirth}
        />
      ) : null}

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

      {isDeceased ? (
        <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
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
                <FormDescription>A year on its own is fine.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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
              control={control}
              name={name("ancestral_lands_death")}
              placeId={placeIdDeath}
              className="sm:col-span-2"
            />
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
                <FormDescription>
                  Kept private unless you choose to show it below.
                </FormDescription>
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

      {isAdmin ? (
        <FormField
          control={control}
          name={name("lineage_type")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lineage</FormLabel>
              <Select
                value={field.value ?? undefined}
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
                      {t[0].toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Admin only. How this person connects to their parent.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </div>
  );
}
