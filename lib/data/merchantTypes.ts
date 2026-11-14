/**
 * Human names for MCC codes (Merchant Category Codes — a standard 4-digit
 * "type of shop" code on every card payment).
 *
 * WHY: the dataset has only 15 broad categories ("Transportation"), but people
 * ask about specific things ("How much did I spend on taxis?"). Data functions
 * match a search word against the category AND this merchant type.
 * Add codes freely — unknown codes simply have no merchant type.
 */
const MCC_LABELS: Record<string, string> = {
  "4121": "Taxi",
  "4111": "Public transport",
  "5541": "Fuel",
  "5542": "Fuel",
  "7523": "Parking",
  "5812": "Restaurant",
  "5814": "Fast food",
  "5813": "Bars",
  "5411": "Supermarket",
  "5499": "Food shop",
  "5422": "Butcher",
  "5451": "Dairy shop",
  "8099": "Health services",
  "4722": "Travel agency",
  "7991": "Attractions",
  "7996": "Amusement park",
  "7999": "Recreation",
  "5200": "Home improvement",
  "5734": "Software",
  "5942": "Books",
  "5945": "Toys & hobbies",
  "5999": "Other shops",
  "5912": "Pharmacy",
  "8011": "Doctor",
  "8021": "Dentist",
  "4511": "Flights",
  "7011": "Hotels",
  "7512": "Car rental",
  "7832": "Cinema",
  "7922": "Concerts & theatre",
  "5651": "Clothing",
  "5691": "Clothing",
  "5941": "Sports gear",
  "5732": "Electronics",
  "5251": "Hardware",
  "5712": "Furniture",
};

export function merchantType(mccCode: string): string | undefined {
  return MCC_LABELS[mccCode.trim()];
}

export function allMerchantTypes(): string[] {
  return [...new Set(Object.values(MCC_LABELS))].sort();
}
