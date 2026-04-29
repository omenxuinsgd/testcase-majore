import requests

# Konfigurasi URL dasar sesuai scripts.js
BASE_URL = "http://localhost:5160"

def get_all_personal_data():
    """
    Mengambil seluruh data dari endpoint data_personal 
    dan menampilkan ID serta Nama saja.
    """
    url = f"{BASE_URL}/api/face/data_personal"
    
    print(f"🚀 Menghubungkan ke: {url}")
    print("-" * 40)
    
    try:
        # Memanggil endpoint data_personal
        response = requests.get(url)
        
        if response.status_code == 200:
            data = response.json()
            
            if isinstance(data, list) and len(data) > 0:
                print(f"✅ Berhasil menemukan {len(data)} user:\n")
                
                # Sortir berdasarkan ID agar tampilan rapi
                sorted_data = sorted(data, key=lambda x: int(x.get('UserID', 0)))
                
                for item in sorted_data:
                    # Mengambil ID dan Nama sesuai properti di scripts_match.js
                    uid = item.get('UserID')
                    name = item.get('Name')
                    print(f"ID: {uid} | Nama: {name}")
            else:
                print("⚠️ Server merespon, tetapi tidak ada data user.")
        else:
            print(f"❌ Gagal mengambil data (Status: {response.status_code})")
            
    except Exception as e:
        print(f"❌ Terjadi kesalahan koneksi: {e}")

if __name__ == "__main__":
    get_all_personal_data()