// Egress is implemented by the comms MCP tool and records real simulated sink rows.
// This driver does not send email, Slack messages or external webhook requests.
export const sinkCapabilities = {
  simulated: true,
  email: false,
  slack: false,
  webhook: false,
};
