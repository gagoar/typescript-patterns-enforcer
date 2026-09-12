export function loadUser(id: string): Promise<string> {
  return fetch(id).then((response) => response.text());
}
