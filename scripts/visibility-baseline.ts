const packages = [
  'orz-mdhtml-browser',
  'orz-slides-browser',
  'orz-paged-browser',
] as const;

type StatsResponse = {
  hits: {
    total: number;
    rank: number | null;
    typeRank: number | null;
  };
  bandwidth: {
    total: number;
    rank: number | null;
    typeRank: number | null;
  };
};

const periodArgument = process.argv.find((argument) => argument.startsWith('--period='));
const period = periodArgument?.slice('--period='.length) || 'month';
const jsonOutput = process.argv.includes('--json');

async function main(): Promise<void> {
  const results = await Promise.all(
    packages.map(async (packageName) => {
      const url = new URL(
        `/v1/stats/packages/npm/${packageName}`,
        'https://data.jsdelivr.com',
      );
      url.searchParams.set('period', period);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `${packageName}: jsDelivr returned ${response.status} ${response.statusText}`,
        );
      }

      const stats = await response.json() as StatsResponse;
      return {
        package: packageName,
        hits: stats.hits.total,
        bandwidthBytes: stats.bandwidth.total,
        hitRank: stats.hits.rank,
        typeHitRank: stats.hits.typeRank,
      };
    }),
  );

  const snapshot = {
    capturedAt: new Date().toISOString(),
    source: 'jsDelivr package stats API',
    period,
    packages: results,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log(`jsDelivr visibility baseline (${period})`);
    console.table(
      results.map((result) => ({
        package: result.package,
        hits: result.hits,
        bandwidthMiB: (result.bandwidthBytes / 1024 / 1024).toFixed(2),
        hitRank: result.hitRank ?? 'n/a',
      })),
    );
    console.log(`Captured at ${snapshot.capturedAt}`);
    console.log('Use --json to save a machine-readable snapshot.');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Visibility baseline failed: ${message}`);
  process.exitCode = 1;
});
