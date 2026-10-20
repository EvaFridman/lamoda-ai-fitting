// web's own health check (spec 0014 O34): a plain 200 that calls nothing, so the container stays
// healthy while the api is down. Public through nginx until PR 4 closes it (plan §3.1), so it
// answers nothing internal.
export function GET() {
  return new Response('ok');
}
