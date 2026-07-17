import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

// Import route registrations (side-effect: populates the registry)
import '../../shared/openapi/registerRoutes.js';
import { generateOpenAPIDocument } from '../../shared/openapi/generator.js';

const router = Router();

// Cache the generated spec so it's not rebuilt on every request
let cachedSpec: ReturnType<typeof generateOpenAPIDocument> | null = null;

function getSpec() {
  if (!cachedSpec) {
    cachedSpec = generateOpenAPIDocument();
  }
  return cachedSpec;
}

// GET /api/docs/openapi.json — raw OpenAPI spec
router.get('/openapi.json', (_req, res) => {
  res.json(getSpec());
});

// Relax CSP for Swagger UI (it needs inline scripts/styles)
router.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  }),
);

// GET /api/docs — Swagger UI
router.use('/', swaggerUi.serve, swaggerUi.setup(undefined, {
  swaggerOptions: { url: '/api/docs/openapi.json' },
}));

export default router;
