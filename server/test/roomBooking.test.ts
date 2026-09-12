// ============================================================
// Test integrasi: cek bentrok jadwal RoomBooking & guard hapus Ruangan
// ============================================================
// Audit gap fix (Fasilitas & Inventaris, sesi sebelumnya): bentrok jadwal
// ruangan sebelumnya CUMA dicek di client (findRoomConflict() di
// RoomBooking.tsx) -- tidak ada penegakan server sama sekali, dan
// menghapus ruangan yang masih punya riwayat booking bisa membuat
// roomName di booking lama jadi rujukan yatim. Fitur ini sudah dibuat di
// sesi sebelumnya (checkRoomBookingConflict/blockRoomDeletionWithBookings
// di server/routes/data.ts) tapi belum pernah punya test otomatis sama
// sekali -- ditutup di sini.
// ============================================================
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { getTestApp, authHeader, uniqueCode } from './helpers.js';

describe('POST/PUT /api/data/roomBookings -- cek bentrok jadwal server-side', () => {
  it('booking di ruangan/jam yang belum terpakai berhasil dibuat (200)', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-roombooking-test');
    const roomName = uniqueCode('Aula');

    const res = await request(app).post('/api/data/roomBookings').set('Authorization', admin).send({
      roomName, bookedBy: 'Panitia A', phone: '081200000001', purpose: 'Rapat A',
      date: '2026-03-01', startTime: '09:00', endTime: '10:00', status: 'Approved',
    });
    expect(res.status).toBe(200);
  });

  it('booking bentrok (ruangan+tanggal sama, jam tumpang tindih) ditolak dengan 400', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-roombooking-test');
    const roomName = uniqueCode('Aula');

    const first = await request(app).post('/api/data/roomBookings').set('Authorization', admin).send({
      roomName, bookedBy: 'Panitia B', phone: '081200000002', purpose: 'Rapat B',
      date: '2026-03-02', startTime: '09:00', endTime: '11:00', status: 'Approved',
    });
    expect(first.status).toBe(200);

    const conflict = await request(app).post('/api/data/roomBookings').set('Authorization', admin).send({
      roomName, bookedBy: 'Panitia C', phone: '081200000003', purpose: 'Rapat C',
      date: '2026-03-02', startTime: '10:00', endTime: '12:00', status: 'Approved',
    });
    expect(conflict.status).toBe(400);
    expect(conflict.body.error).toMatch(/sudah dipesan pada jam tersebut/);
  });

  it('booking di ruangan sama tapi status Cancelled TIDAK dianggap bentrok', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-roombooking-test');
    const roomName = uniqueCode('Aula');

    await request(app).post('/api/data/roomBookings').set('Authorization', admin).send({
      roomName, bookedBy: 'Panitia D', phone: '081200000004', purpose: 'Rapat D (batal)',
      date: '2026-03-03', startTime: '09:00', endTime: '11:00', status: 'Cancelled',
    });

    const res = await request(app).post('/api/data/roomBookings').set('Authorization', admin).send({
      roomName, bookedBy: 'Panitia E', phone: '081200000005', purpose: 'Rapat E',
      date: '2026-03-03', startTime: '10:00', endTime: '12:00', status: 'Approved',
    });
    expect(res.status).toBe(200);
  });

  it('booking di ruangan berbeda pada jam yang sama TIDAK dianggap bentrok', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-roombooking-test');
    const roomA = uniqueCode('RuangA');
    const roomB = uniqueCode('RuangB');

    await request(app).post('/api/data/roomBookings').set('Authorization', admin).send({
      roomName: roomA, bookedBy: 'Panitia F', phone: '081200000006', purpose: 'Rapat F',
      date: '2026-03-04', startTime: '09:00', endTime: '11:00', status: 'Approved',
    });

    const res = await request(app).post('/api/data/roomBookings').set('Authorization', admin).send({
      roomName: roomB, bookedBy: 'Panitia G', phone: '081200000007', purpose: 'Rapat G',
      date: '2026-03-04', startTime: '09:00', endTime: '11:00', status: 'Approved',
    });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/data/rooms/:id -- guard ruangan masih punya riwayat booking', () => {
  it('ruangan TANPA riwayat booking berhasil dihapus (200)', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-roomdel-test');
    const roomId = uniqueCode('room-clean');
    const roomName = uniqueCode('RuanganBersih');

    const create = await request(app).put(`/api/data/rooms/${roomId}`).set('Authorization', admin).send({
      id: roomId, name: roomName, capacity: 50, isActive: true,
    });
    expect(create.status).toBe(200);

    const del = await request(app).delete(`/api/data/rooms/${roomId}`).set('Authorization', admin);
    expect(del.status).toBe(200);
  });

  it('ruangan yang masih punya riwayat booking (roomName cocok) menolak DELETE dengan 403', async () => {
    const app = await getTestApp();
    const admin = authHeader('user-admin-roomdel-test');
    const roomId = uniqueCode('room-withbooking');
    const roomName = uniqueCode('RuanganDipakai');

    await request(app).put(`/api/data/rooms/${roomId}`).set('Authorization', admin).send({
      id: roomId, name: roomName, capacity: 30, isActive: true,
    });

    await request(app).post('/api/data/roomBookings').set('Authorization', admin).send({
      roomName, bookedBy: 'Panitia H', phone: '081200000008', purpose: 'Rapat H',
      date: '2026-03-05', startTime: '09:00', endTime: '10:00', status: 'Approved',
    });

    const del = await request(app).delete(`/api/data/rooms/${roomId}`).set('Authorization', admin);
    expect(del.status).toBe(403);
    expect(del.body.error).toMatch(/masih punya riwayat booking/);
  });
});
