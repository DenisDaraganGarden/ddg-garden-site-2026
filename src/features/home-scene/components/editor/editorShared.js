// Shared by the editor sections: keep the formatting and the option lists in one
// place so a new section cannot drift into its own number formatting.
export const formatFloat = (value, digits = 2) => Number(value).toFixed(digits);

export const SIMULATION_RESOLUTION_OPTIONS = [128, 256, 384, 512].map((value) => ({
    value,
    label: `${value} × ${value}`,
}));
