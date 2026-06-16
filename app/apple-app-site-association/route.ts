import { GET as getAasa } from "../.well-known/apple-app-site-association/route"

/** Some Apple crawlers request the file at the root path. */
export async function GET() {
  return getAasa()
}
