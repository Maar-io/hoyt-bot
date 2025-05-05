```
hoyt-bot/
├── package.json                # Project dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── .env.example                # Environment variables template
├── .eslintrc.js                # ESLint configuration
├── .prettierrc                 # Prettier code formatting config
├── Dockerfile                  # Docker configuration
├── docker-compose.yml          # Docker Compose configuration
├── README.md                   # Project documentation
├── SECURITY.md                 # Security considerations
│
├── src/                        # Source code
│   ├── main.ts                 # Entry point
│   ├── config.ts               # Configuration loader
│   ├── types.ts                # Type definitions
│   ├── logger.ts               # Logging utility
│   │
│   ├── modules/                # Core modules
│   │   ├── lpWatcher.ts        # LP position monitoring
│   │   ├── hedgeController.ts  # Hedge position management
│   │   └── hyperliquidClient.ts # Hyperliquid API client
│   │
│   └── utils/                  # Utility functions
│       ├── calculations.ts     # Math utility functions
│       ├── configValidator.ts  # Config validation
│       ├── errorHandler.ts     # Error handling
│       └── secureUtils.ts      # Security utilities
│
├── tests/                      # Test files
│   └── utils/
│       └── calculations.test.ts # Tests for calculation utilities
│
├── scripts/                    # Utility scripts
│   └── build.sh                # Build script
│
└── dist/                       # Compiled JavaScript (generated)
    └── ...                     # Compiled files
```

### Key Components

1. **Core Modules**:
   - `lpWatcher.ts`: Monitors Uniswap V3 LP positions and calculates exposure
   - `hedgeController.ts`: Manages hedge positions on Hyperliquid
   - `hyperliquidClient.ts`: Client for interacting with Hyperliquid API

2. **Utilities**:
   - `calculations.ts`: Mathematical functions for position sizing and deviation calculation
   - `configValidator.ts`: Validation of environment variables and configuration
   - `errorHandler.ts`: Centralized error handling with classification
   - `secureUtils.ts`: Functions for handling sensitive data securely

3. **Configuration**:
   - `.env.example`: Template for environment variables
   - `config.ts`: Loading and processing of configuration parameters

4. **Testing and Quality**:
   - `tests/`: Unit tests with Vitest
   - `.eslintrc.js` & `.prettierrc`: Code quality enforcement

5. **Deployment**:
   - `Dockerfile` & `docker-compose.yml`: Containerization
   - `scripts/build.sh`: Build process automation