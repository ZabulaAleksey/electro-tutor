# Fourier лаборатория ElectroTutor

Статус: утверждённый прямой user contract2026-10-29. Source — текущий Fourier Sketch read-only; публичный продукт Astro/React/TypeScript, без backend/new dependency. Slice owner ET-LABS-002.

## Математика и контракты

- `FOUR-001`: комплексные samples z=x+iy, c[k]=(1/N)Σz[n]exp(−i2πkn/N), inverse sum with positive exponent, signed frequencies incl DC/Nyquist. Normalization/order/phase explicit; math core independent from rendering.
- `FOUR-002`: mouse/touch/stylus contour drawing, clear/undo/close/demo; duplicate removal, arc-length or declared uniform-parameter resampling, center/scale; distinguish open contours and periodic closure. DFT inverse and final head-to-tail chain endpoint equal trace exactly; no separately decorative trace.
- `FOUR-003`: harmonic count/order, source/reconstruction/circle/vector/trace visibility, amplitude/phase/enable edit, amplitude/phase spectrum/coefficient table, RMS/max error, shared scales/units (dimensionless mathematical axes), reference reconstruction. Reasonable samples/harmonics cap avoids blocking UI; worker only if needed.
- `FOUR-004`: phase/play/pause/resume/reset/step/loop/speed/zoom/pan; speed independent of coefficients/phase continuity, reduced motion and hidden tabs suspend motion. RU/UK, mobile controls and theme changes preserve math state.
- `FOUR-005`: adapt verified Harmonic Playground and Fourier/Haar/DCT-II/Walsh–Hadamard features when source supports them; non-Fourier bases render appropriate functions/reconstruction, not fake epicycles. Equal coefficient-count/error metric for comparison. Document convention/provenance of adapted source and independent tiny examples.
- `FOUR-006`: bounded local CSV/coordinates/config/coefficients/plot export and image contour import where implemented. Untrusted data validated with size/count/finite/domain limits; multi-contour image selection honest, no upload/backend/external transmission, no unsafe HTML/SVG injection. No blanket raster→single contour claim.
- `FOUR-007`: separate real route in existing interactive catalog, paired RU/UK navigation/metadata. Tests: constant/unit circle/negative-frequency/manual small DFT/full inverse/truncation/phase/chain endpoint; basis independent orthogonality/reconstruction; actual draw/harmonic/speed/theme/mobile user path. No changes to original Fourier Sketch/MathMorph.

## Acceptance и rollback

Draw/demo contour→resample→coefficients→epicycles+actual reconstruction+amplitude spectrum→harmonic edit→same endpoint/error→pause/phase/speed→theme/permalink/export. Build and live browser required. First vertical slice FOUR-001..004/007 must stand alone; verified source features005/006 then extend it. GIF/video and general image inference remain optional, not release prerequisites. Revert isolated feature commit if necessary; no data migration.
