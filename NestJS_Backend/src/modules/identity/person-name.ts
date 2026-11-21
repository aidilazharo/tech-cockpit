/** How a person is named on screen: first and last name, or their Okta username when no name has been entered. */
export function personName(user: { firstName: string; lastName: string; username: string }): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.username;
}
