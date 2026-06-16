# Questions

## main.jsx

### Why axios? Any specific reasons? Are there alternatives?

`axios` is an HTTP client library. It is used to make requests from the frontend to the backend, like `GET /api/papers`, `POST /api/arxiv/add`, etc.

The main reason teams use axios is ergonomics. Compared to the browser's built-in `fetch`, axios gives you a cleaner default API: it automatically parses JSON responses, treats non-2xx responses as errors, supports global defaults like `axios.defaults.baseURL`, and has interceptors, which are hooks that run before/after requests. This app uses that global base URL behavior in Electron and also appears to use axios instrumentation.

The main alternative is native `fetch`, which is built into browsers:

```js
const response = await fetch('/api/papers')
const data = await response.json()
```

That is perfectly valid. For this app, axios is not strictly necessary, but it is reasonable. The app already uses it consistently, so I would not remove it casually unless we decide to simplify all API code at once.

### What is this Electron axios baseURL doing?

This part:

```js
if (typeof window !== 'undefined' && window.electron?.apiUrl) {
  axios.defaults.baseURL = window.electron.apiUrl
}
```

means: "If we are running inside Electron, and Electron has told the frontend where the backend API lives, make axios use that as the default server."

In browser dev mode, `/api/papers` goes to the Vite dev server, and Vite proxies it to the backend on `localhost:7474`.

In Electron, the frontend may be loaded from a built file or app shell, so relative `/api/...` paths may not naturally point to the Express server. Electron exposes `window.electron.apiUrl`, probably from `preload.js`, and this line tells axios: "Send `/api/...` requests to that backend URL."

So yes, that bit has a real purpose.

### Is instrumentation necessary? What are we doing with it?

This import:

```js
import { setupAxiosInstrumentation, setupGlobalErrorInstrumentation } from './lib/instrumentation'
```

is bringing in code that watches app behavior. Based on the names, one part wraps axios requests so the app can log failed or slow API calls. The other sets up global browser error handlers, probably for uncaught errors and rejected promises.

Is it necessary? Not for the app to function. The app can run without instrumentation. But it is useful for debugging, especially during development or if you want a local error log. It gives you visibility into failures that might otherwise disappear into the browser console.

So I would call it "diagnostic infrastructure," not core product behavior.

### Does instrumentation need to be inside `lib`? What is the JavaScript way?

`lib` is a common JavaScript convention for reusable non-UI code. A `utils` folder is also common. There is no single official JS way.

A rough convention is:

`components/` means React components.

`pages/` means route-level screens.

`lib/` means reusable app/library code, often things with behavior: API clients, instrumentation, date helpers, storage helpers, parsing helpers.

`utils/` often means tiny pure helper functions, like `formatDate`, `cn`, `clamp`, etc.

So `lib/instrumentation.js` is a reasonable place. It is more than a tiny utility. It sets up global behavior. I would not move it just because Python would use `utils`.

That said, this repo currently has both `src/lib` and `src/utils`, which can become fuzzy. We should eventually decide what belongs where.

### Do we need a new component for `InstrumentationErrorBoundary`? Is this the normal error page?

An error boundary has to be a React component. In React 18, error boundaries are still normally implemented as class components, because the official error boundary API uses lifecycle methods like `componentDidCatch`.

So yes, having a separate component for this is normal.

But no, it is probably not a full "normal error page." It is more like a safety wrapper around the whole app. If a React rendering error happens inside `<App />`, this boundary catches it and shows fallback UI instead of letting the whole screen go blank.

There are two kinds of error UI to distinguish:

A route-level error page says "this page failed" or "404 not found."

An error boundary fallback says "the React app crashed while rendering."

This app appears to have the second kind, not a polished first kind.

### Does the client have an error page?

From what I saw, not really.

It has `InstrumentationErrorBoundary`, which likely catches app crashes. It also has toasts for smaller errors like "Paper not found" or "Could not open paper." But I do not see a dedicated, user-facing error route/page like `/error`, `NotFound`, or a proper API failure page.

So your observation is fair. You probably have not seen it because most handled failures become toasts, and severe render errors are less common.

### What does React StrictMode do?

`React.StrictMode` is a development-only helper. It does not render visible UI. It wraps your app and makes React perform extra checks.

The most noticeable behavior is that in development, React may intentionally run some things twice, like component render setup and effects. This helps reveal bugs where code accidentally depends on running exactly once. For example, if an effect starts a subscription but forgets to clean it up, StrictMode makes that easier to catch.

It does not do this in production builds. Users do not get double behavior in the shipped app.

So this:

```jsx
<React.StrictMode>
  <App />
</React.StrictMode>
```

means: "During development, be stricter and help reveal unsafe React patterns."

It can feel annoying when learning React because logs or effects may appear twice, but it is generally a good thing to keep.
