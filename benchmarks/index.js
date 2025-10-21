/**
 * Performance benchmarks for rapid-objection
 * Measures critical operations and tracks performance regressions
 */

const Benchmark = require('benchmark');
const { writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve, dirname } = require('path');
const chalk = require('chalk');

// Import components to benchmark
const { ConnectionManager } = require('../dist/ConnectionManager');
const { MigrationManager } = require('../dist/MigrationManager');
const { SeedManager } = require('../dist/SeedManager');
const { ModelManager } = require('../dist/ModelManager');

class PerformanceBenchmark {
  constructor() {
    this.results = [];
    this.suite = new Benchmark.Suite();
    this.isCI = process.argv.includes('--ci');
    this.startTime = Date.now();
  }

  async setup() {
    console.log(chalk.blue('🚀 Setting up performance benchmarks...'));

    // Ensure results directory exists
    const resultsDir = resolve(process.cwd(), 'benchmarks/results');
    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }

    // Initialize test database
    this.dbManager = new ConnectionManager(
      {
        database: {
          client: 'sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        },
        migrations: { enabled: false },
        seeds: { enabled: false },
        models: { enabled: false },
      },
      'benchmark-test'
    );

    await this.dbManager.initialize();
    console.log(chalk.green('✅ Database initialized'));
  }

  addBenchmarks() {
    console.log(chalk.blue('📊 Adding benchmark tests...'));

    // Connection Manager benchmarks
    this.suite.add('ConnectionManager#initialize', {
      defer: true,
      fn: async deferred => {
        let manager;
        try {
          manager = new ConnectionManager(
            {
              database: {
                client: 'sqlite3',
                connection: { filename: ':memory:' },
                useNullAsDefault: true,
              },
              migrations: { enabled: false },
              seeds: { enabled: false },
              models: { enabled: false },
            },
            `benchmark-test-${Date.now()}`
          );
          await manager.initialize();
          await manager.shutdown();
          deferred.resolve();
        } catch (error) {
          if (manager) {
            try {
              await manager.shutdown();
            } catch (e) {
              /* ignore */
            }
          }
          deferred.reject(error);
        }
      },
    });

    // Migration Manager benchmarks
    this.suite.add('MigrationManager#initialize', {
      defer: true,
      fn: async deferred => {
        let migrationManager;
        try {
          migrationManager = new MigrationManager(
            {
              migrations: { enabled: false },
            },
            'test'
          );
          await migrationManager.initialize();
          await migrationManager.shutdown();
          deferred.resolve();
        } catch (error) {
          if (migrationManager) {
            try {
              await migrationManager.shutdown();
            } catch (e) {
              /* ignore */
            }
          }
          deferred.reject(error);
        }
      },
    });

    // Seed Manager benchmarks
    this.suite.add('SeedManager#initialize', {
      defer: true,
      fn: async deferred => {
        let seedManager;
        try {
          seedManager = new SeedManager(
            {
              seeds: { enabled: false },
            },
            `benchmark-seed-${Date.now()}`
          );
          await seedManager.initialize();
          await seedManager.shutdown();
          deferred.resolve();
        } catch (error) {
          if (seedManager) {
            try {
              await seedManager.shutdown();
            } catch (e) {
              /* ignore */
            }
          }
          deferred.reject(error);
        }
      },
    });

    // Model Manager benchmarks
    this.suite.add('ModelManager#initialize', {
      defer: true,
      fn: async deferred => {
        let modelManager;
        try {
          modelManager = new ModelManager(
            {
              models: { enabled: false },
            },
            `benchmark-model-${Date.now()}`
          );
          await modelManager.initialize();
          await modelManager.shutdown();
          deferred.resolve();
        } catch (error) {
          if (modelManager) {
            try {
              await modelManager.shutdown();
            } catch (e) {
              /* ignore */
            }
          }
          deferred.reject(error);
        }
      },
    });

    console.log(chalk.green(`✅ Added ${this.suite.length} benchmark tests`));
  }

  async run() {
    console.log(chalk.yellow('🏃 Running benchmarks...'));

    return new Promise(resolve => {
      this.suite
        .on('cycle', event => {
          const benchmark = event.target;
          console.log(
            chalk.cyan(
              `  ${benchmark.name}: ${benchmark.hz.toFixed(2)} ops/sec ±${benchmark.stats.rme.toFixed(2)}%`
            )
          );

          this.results.push({
            name: benchmark.name,
            hz: benchmark.hz,
            rme: benchmark.stats.rme,
            samples: benchmark.stats.sample.length,
          });
        })
        .on('complete', () => {
          console.log(chalk.green('✅ Benchmarks completed'));
          resolve();
        })
        .on('error', error => {
          console.error(chalk.red('❌ Benchmark error:'), error);
          resolve();
        })
        .run({ async: true });
    });
  }

  async saveResults() {
    const resultsPath = resolve(process.cwd(), 'benchmarks/results/benchmark-results.txt');
    const resultsDir = dirname(resultsPath);

    // Ensure results directory exists
    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
      console.log(chalk.gray(`📁 Created results directory: ${resultsDir}`));
    }

    // Convert results to benchmark.js text format
    const textOutput = this.results
      .map(result => {
        const opsPerSec = result.hz.toLocaleString('en-US', { maximumFractionDigits: 2 });
        const rme = result.rme.toFixed(2);
        const samples = result.samples;
        return `${result.name} x ${opsPerSec} ops/sec ±${rme}% (${samples} runs sampled)`;
      })
      .join('\n');

    writeFileSync(resultsPath, textOutput);
    console.log(chalk.green(`📄 Results saved to ${resultsPath}`));
  }

  async cleanup() {
    try {
      if (this.dbManager) {
        await this.dbManager.shutdown();
      }

      // Clear any remaining benchmark suite references
      if (this.suite && typeof this.suite.removeAllListeners === 'function') {
        this.suite.removeAllListeners();
      }

      console.log(chalk.green('🧹 Cleanup completed'));
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Cleanup warning:'), error.message);
    }
  }

  displaySummary() {
    console.log(chalk.blue('\n📈 Benchmark Summary:'));
    console.log(chalk.blue('─'.repeat(50)));

    this.results.forEach(result => {
      console.log(
        chalk.white(`${result.name.padEnd(30)} ${result.hz.toFixed(2).padStart(10)} ops/sec`)
      );
    });

    console.log(chalk.blue('─'.repeat(50)));
    console.log(chalk.green(`Total duration: ${Date.now() - this.startTime}ms`));
  }
}

function checkActiveHandles() {
  try {
    // Get active handles and requests if APIs exist
    const activeHandles = process._getActiveHandles ? process._getActiveHandles() : [];
    const activeRequests = process._getActiveRequests ? process._getActiveRequests() : [];

    console.log(chalk.gray(`\n🔍 Active Handle Check:`));
    console.log(chalk.gray(`  - Active handles: ${activeHandles.length}`));
    console.log(chalk.gray(`  - Active requests: ${activeRequests.length}`));

    if (activeHandles.length > 0) {
      console.log(chalk.gray(`\n📋 Handle Details:`));
      activeHandles.forEach((handle, index) => {
        try {
          const handleName = handle.constructor ? handle.constructor.name : 'Unknown';
          const handleType = typeof handle;
          console.log(chalk.gray(`  ${index + 1}. ${handleName} (${handleType})`));

          // Show additional info if available
          if (handle._handle && handle._handle.constructor) {
            console.log(chalk.gray(`     └─ Internal: ${handle._handle.constructor.name}`));
          }
        } catch (error) {
          console.log(chalk.gray(`  ${index + 1}. [Error getting handle info: ${error.message}]`));
        }
      });
    }

    if (activeRequests.length > 0) {
      console.log(chalk.gray(`\n📨 Request Details:`));
      activeRequests.forEach((request, index) => {
        try {
          const requestName = request.constructor ? request.constructor.name : 'Unknown';
          console.log(chalk.gray(`  ${index + 1}. ${requestName}`));
        } catch (error) {
          console.log(chalk.gray(`  ${index + 1}. [Error getting request info: ${error.message}]`));
        }
      });
    }

    if (activeHandles.length === 0 && activeRequests.length === 0) {
      console.log(chalk.gray(`  ✅ No active handles or requests detected`));
    }
  } catch (error) {
    console.log(chalk.gray(`⚠️ Error checking active handles: ${error.message}`));
  }
}

async function main() {
  const benchmark = new PerformanceBenchmark();

  try {
    console.log(chalk.magenta('🎯 Starting rapid-objection performance benchmarks\n'));

    await benchmark.setup();
    benchmark.addBenchmarks();
    await benchmark.run();
    benchmark.displaySummary();
    await benchmark.saveResults();

    console.log(chalk.green('\n🎉 All benchmarks completed successfully!'));
    await benchmark.cleanup();

    // Check what handles are still active before exit
    checkActiveHandles();

    // Ensure process exits (Node.js sometimes hangs on benchmark cleanup)
    setTimeout(() => {
      console.log(chalk.gray('✅ Benchmark completed successfully'));
      process.exit(0);
    }, 200);
  } catch (error) {
    console.error(chalk.red('❌ Benchmark failed:'), error);
    await benchmark.cleanup();
    process.exit(1);
  }
}

// Run if this file is executed directly
if (process.argv[1] === __filename) {
  main();
}

module.exports = { PerformanceBenchmark };
