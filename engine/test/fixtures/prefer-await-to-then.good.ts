export async function loadUser(id: string): Promise<string> {
  const response = await fetch(id);
  return response.text();
}
