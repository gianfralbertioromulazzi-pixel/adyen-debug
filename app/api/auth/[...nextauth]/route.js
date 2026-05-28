// app/api/auth/[...nextauth]/route.js
//
// ⚠️  GOTCHA #1 — App Router + NextAuth v4:
//     NON usare `export default` né `export { handler as GET, handler as POST }` inline.
//     L'unico pattern che funziona in modo affidabile è quello sotto.
//
// ⚠️  GOTCHA #2 — NON importare authOptions da un altro file nella stessa cartella
//     se quel file usa `import` ES module misto a CJS. Tieni tutto qui oppure in
//     un file lib/ separato (vedi lib/auth.js).

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

// App Router richiede named exports GET e POST — NON default export
export { handler as GET, handler as POST };
