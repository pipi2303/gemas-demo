INSERT INTO gemas_store (collection, id, data) VALUES (
  'members',
  'test-birthday-member-1',
  '{"id":"test-birthday-member-1","firstName":"Budi","lastName":"Ulang Tahun","fullName":"Budi Ulang Tahun","gender":"Laki-laki","familyRole":"Kepala Keluarga","birthPlace":"Manado","birthDate":"1990-08-23","age":36,"membershipType":"Warga Sidi","isActive":true,"status":"Aktif"}'
) ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data;
