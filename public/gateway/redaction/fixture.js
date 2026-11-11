export const fixtureFields = [
  { label: "Payment card", value: "4111 1111 1111 1111" },
  { label: "Leia's contact email", value: "leia.organa@example.com" },
  { label: "Rebel dispatch phone", value: "+1 202-555-0142" },
  { label: "Hangar API Authorization", value: "Basic cjJkMjpERU1PLU5PVC1BLVJFQUwtU0VDUkVU" },
];

export const fixtureBody = [
  "Demo refund · THB 1,250 · Millennium Falcon parking fee",
  ...fixtureFields.map(({ label, value }) => `${label}: ${value}`),
].join("\n");

export const requestTemplate = {
  model: "r5r5-summary",
  messages: [
    { role: "system", content: "Demo run: <created by EKS runner>" },
    { role: "user", content: fixtureBody },
  ],
};
