20:37:49.249 Running build in Washington, D.C., USA (East) – iad1
20:37:49.250 Build machine configuration: 2 cores, 8 GB
20:37:49.362 Cloning github.com/johnatan365/cricken-nomina (Branch: main, Commit: f9520d8)
20:37:49.801 Cloning completed: 439.000ms
20:37:50.204 Restored build cache from previous deployment (BTug6Z5SvAdLK5NQjriWYTwp9ovE)
20:37:52.568 Running "vercel build"
20:37:53.238 Vercel CLI 51.6.1
20:37:53.615 Installing dependencies...
20:38:09.105 
20:38:09.108 up to date in 15s
20:38:09.109 
20:38:09.110 151 packages are looking for funding
20:38:09.111   run `npm fund` for details
20:38:09.147 Detected Next.js version: 14.1.0
20:38:09.154 Running "npm run build"
20:38:10.560 
20:38:10.560 > cricken-nomina@0.1.0 build
20:38:10.561 > next build
20:38:10.561 
20:38:11.236    ▲ Next.js 14.1.0
20:38:11.237 
20:38:11.257    Creating an optimized production build ...
20:38:14.299 Failed to compile.
20:38:14.300 
20:38:14.300 ./app/admin/cierre-caja/page.tsx
20:38:14.300 Error: 
20:38:14.301   [31mx[0m Unexpected token `div`. Expected jsx identifier
20:38:14.301      ,-[[36;1;4m/vercel/path0/app/admin/cierre-caja/page.tsx[0m:191:1]
20:38:14.301  [2m191[0m |   )
20:38:14.301  [2m192[0m | 
20:38:14.302  [2m193[0m |   return (
20:38:14.302  [2m194[0m |     <div className="space-y-5 max-w-5xl mx-auto">
20:38:14.302      : [31;1m     ^^^[0m
20:38:14.302  [2m195[0m |       <div>
20:38:14.303  [2m196[0m |         <h1 className="page-title">Cierres de Caja</h1>
20:38:14.303  [2m197[0m |         <p className="text-muted mt-1">Cierres enviados por los trabajadores</p>
20:38:14.303      `----
20:38:14.303 
20:38:14.303 Caused by:
20:38:14.304     Syntax Error
20:38:14.304 
20:38:14.304 Import trace for requested module:
20:38:14.304 ./app/admin/cierre-caja/page.tsx
20:38:14.304 
20:38:14.314 
20:38:14.315 > Build failed because of webpack errors
20:38:14.350 Error: Command "npm run build" exited with 1
