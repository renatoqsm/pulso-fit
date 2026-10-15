/** Never display an upstream HTML error page as a JSON parser exception. */
export async function readApiResponse(response: Response) {
  if (response.status === 401)
    throw new Error('Sua sessão expirou. Entre novamente para continuar.');
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(
      `O servidor não conseguiu responder agora (HTTP ${response.status}). Tente novamente.`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error('A resposta do servidor veio incompleta. Tente novamente.');
  }
}
