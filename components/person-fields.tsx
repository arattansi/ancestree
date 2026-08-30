"use client";

import * as React from "react";
import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

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
import { LINEAGE_TYPES } from "@/lib/person-schema";

/**
 * The shared demographic fieldset for a single person. Works standalone
 * (`prefix` omitted) or as one row of a `people[]` field array (`prefix`
 * e.g. `"people.2"`).
 */
export function PersonFields<T extends FieldValues>({
  control,
  isAdmin,
  prefix,
  idPrefix,
}: {
  control: Control<T>;
  isAdmin: boolean;
  prefix?: string;
  idPrefix: string;
}) {
  const name = React.useCallback(
    (field: string) => (prefix ? `${prefix}.${field}` : field) as Path<T>,
    [prefix],
  );

  const isDeceased = useWatch({ control, name: name("is_deceased") });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name={name("given_name")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Given name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="given-name"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>
                Enter a given name or a preferred name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name("preferred_name")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="nickname"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={name("family_name")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Family name</FormLabel>
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
              Optional. A family name at birth, before any change on marriage.
            </FormDescription>
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
                <Input type="date" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name("city_of_birth")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>City of birth</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={name("country_of_birth")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Country of birth</FormLabel>
            <FormControl>
              <Input
                autoComplete="country-name"
                required
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
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={name("place_of_death")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Place of death</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
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
