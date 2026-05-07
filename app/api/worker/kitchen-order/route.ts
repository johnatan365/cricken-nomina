21:33:31.232 Running build in Washington, D.C., USA (East) – iad1
21:33:31.232 Build machine configuration: 2 cores, 8 GB
21:33:31.486 Cloning github.com/johnatan365/cricken-nomina (Branch: main, Commit: 76ce05e)
21:33:33.191 Cloning completed: 1.705s
21:33:34.093 Restored build cache from previous deployment (9D8KkEKqw4jxyHMC7e4xgr8nN5FR)
21:33:34.295 Running "vercel build"
21:33:35.006 Vercel CLI 51.6.1
21:33:35.286 Installing dependencies...
21:33:47.531 
21:33:47.531 up to date in 12s
21:33:47.532 
21:33:47.532 151 packages are looking for funding
21:33:47.533   run `npm fund` for details
21:33:47.578 Detected Next.js version: 14.1.0
21:33:47.583 Running "npm run build"
21:33:47.690 
21:33:47.691 > cricken-nomina@0.1.0 build
21:33:47.691 > next build
21:33:47.691 
21:33:48.351    ▲ Next.js 14.1.0
21:33:48.352 
21:33:48.373    Creating an optimized production build ...
21:33:52.070 Failed to compile.
21:33:52.071 
21:33:52.071 ./app/api/worker/kitchen-order/route.ts
21:33:52.071 Error: 
21:33:52.071   [31mx[0m cannot reassign to a variable declared with `const`
21:33:52.071     ,-[[36;1;4m/vercel/path0/app/api/worker/kitchen-order/route.ts[0m:24:1]
21:33:52.071  [2m24[0m |   if (!worker_id) return NextResponse.json({ error: 'worker_id requerido' }, { status: 400 })
21:33:52.071  [2m25[0m | 
21:33:52.076  [2m26[0m |   const supabase     = createAdminClient()
21:33:52.076  [2m27[0m |   const deliveryDate = getDeliveryDate()
21:33:52.077     : [31;1m        ^^^^^^|^^^^^[0m
21:33:52.077     :               [31;1m`-- [31;1mconst variable was declared here[0m[0m
21:33:52.077  [2m28[0m | 
21:33:52.077  [2m29[0m |   const orderType = searchParams.get('order_type') || 'kitchen'
21:33:52.077  [2m30[0m |   // Food tracker: siempre fecha actual, sin corte 2pm
21:33:52.077  [2m31[0m |   if (orderType === 'food') {
21:33:52.077  [2m32[0m |     const todayBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
21:33:52.077  [2m33[0m |     deliveryDate = todayBogota.toISOString().split('T')[0]
21:33:52.077     : [33;1m    ^^^^^^|^^^^^[0m
21:33:52.077     :           [33;1m`-- [33;1mcannot reassign[0m[0m
21:33:52.077  [2m34[0m |   }
21:33:52.077  [2m35[0m | 
21:33:52.077  [2m36[0m |   // Buscar pedido pending sin confirmar (cualquier fecha)
21:33:52.078     `----
21:33:52.078 
21:33:52.078 Import trace for requested module:
21:33:52.078 ./app/api/worker/kitchen-order/route.ts
21:33:52.078 
21:33:52.091 
21:33:52.092 > Build failed because of webpack errors
21:33:52.122 Error: Command "npm run build" exited with 1
