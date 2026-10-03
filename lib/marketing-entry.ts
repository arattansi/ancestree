import type { AccountTypeKey } from "@/lib/account-types";
import type { TreeGraphPerson } from "@/lib/tree";

/**
 * An entry as the canvas would load it, for a leaf drawn on a marketing
 * page (the Elevators tree, Step 107; /about-us, Step 111): a name, a
 * birthplace and an account type, and everything else left out — no
 * dates, no photo.
 */
export function marketingEntry(p: {
  id: string;
  first: string;
  middle?: string | null;
  last: string;
  maiden: string | null;
  city: string;
  country: string;
  account: AccountTypeKey | null;
}): TreeGraphPerson {
  return {
    id: p.id,
    first_name: p.first,
    middle_name: p.middle ?? null,
    preferred_name: null,
    maiden_name: p.maiden,
    last_name: p.last,
    date_of_birth: null,
    date_of_death: null,
    date_of_birth_precision: "day",
    date_of_death_precision: "day",
    birth_month: null,
    birth_day: null,
    date_of_birth_circa: false,
    date_of_death_circa: false,
    city_of_birth: p.city,
    country_of_birth: p.country,
    place_id_birth: null,
    place_id_death: null,
    is_deceased: false,
    place_of_death: null,
    sex: null,
    email: null,
    email_visible: false,
    birth_place_historical: null,
    death_place_historical: null,
    lineage_type: null,
    photo_path: null,
    photo_crop: null,
    pos_x: null,
    pos_y: null,
    pos_dx: null,
    pos_dy: null,
    owner_user_id: "",
    created_by: "",
    home_tree_id: "",
    placeholder_number: null,
    is_home: true,
    hidden_from_visitors: false,
    blurred: false,
    basic: false,
    approval: "none",
    asked_of: null,
    photo_url: null,
    photo_card_url: null,
    open_report_count: 0,
    claim_status: null,
    claim_id: null,
    account_type: p.account,
    joined_by: null,
  };
}
