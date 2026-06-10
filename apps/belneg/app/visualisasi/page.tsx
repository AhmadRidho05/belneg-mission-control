import {
  kkriTargetKpi, targetBentukDistribution, targetAkreditasiBreakdown, targetInternetBreakdown,
  targetPosisiBreakdown, targetProvinceDistribution, targetKabKotaDistribution, targetKecamatanDistribution,
  targetPulauDistribution, targetProvinceBentukTree, targetLevelDistribution,
  targetKodamSummary, targetKoremSummary, targetKoramilSummary, kodimSummary,
  targetSchoolDirectory,
} from "@/lib/db";
import { VisualisasiShell } from "./visualisasi-shell";

export const dynamic = "force-dynamic";

export default async function VisualisasiPage() {
  const [
    kpi, bentuk, akreditasi, internet, posisi,
    provinsi, kabKota, kecamatan, pulau, provinceBentukTree, levelDist,
    kodam, korem, koramil, kodim, schools,
  ] = await Promise.all([
    kkriTargetKpi(),
    targetBentukDistribution(),
    targetAkreditasiBreakdown(),
    targetInternetBreakdown(),
    targetPosisiBreakdown(),
    targetProvinceDistribution(12),
    targetKabKotaDistribution(15),
    targetKecamatanDistribution(15),
    targetPulauDistribution(),
    targetProvinceBentukTree(),
    targetLevelDistribution(),
    targetKodamSummary(),
    targetKoremSummary(),
    targetKoramilSummary(15),
    kodimSummary(),
    targetSchoolDirectory(),
  ]);

  return (
    <VisualisasiShell
      kpi={kpi}
      bentuk={bentuk}
      akreditasi={akreditasi}
      internet={internet}
      posisi={posisi}
      provinsi={provinsi}
      kabKota={kabKota}
      kecamatan={kecamatan}
      pulau={pulau}
      provinceBentukTree={provinceBentukTree}
      levelDist={levelDist}
      kodam={kodam}
      korem={korem}
      koramil={koramil}
      kodim={kodim}
      schools={schools}
    />
  );
}
