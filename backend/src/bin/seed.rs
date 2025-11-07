use sqlx::{MySqlPool, Row};
use bcrypt::{hash, DEFAULT_COST};
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Connect to database
    let database_url = "sqlite:./social_media.db?mode=rwc";
    let pool = MySqlPool::connect(database_url).await?;

    println!("🌱 Seeding database with fake data...");

    // Sample usernames
    let usernames = vec![
        "alex_cool", "maria_2024", "ion_dev", "ana_art", "mihai_tech",
        "elena_photo", "radu_music", "diana_travel", "cosmin_gaming", "sofia_books",
        "andrei_fitness", "laura_food", "vlad_movies", "cristina_fashion", "bogdan_sports"
    ];

    // Sample post contents
    let posts = vec![
        "Tocmai am terminat un proiect incredibil! 🚀",
        "Ce zi frumoasă afară! ☀️",
        "Cineva vrea să meargă la cafea? ☕",
        "Am învățat ceva nou astăzi despre programare 💻",
        "Weekend-ul perfect ar fi... 🏖️",
        "Tocmai am citit o carte grozavă! 📚",
        "Muzica face totul mai bun! 🎵",
        "Pizza > orice altceva 🍕",
        "Motivație pentru ziua de azi! 💪",
        "Doar eu iubesc ploaia? 🌧️",
        "Coding la 3 AM e altceva 🌙",
        "Cafeaua #7 a zilei... ☕☕☕",
        "Am nevoie de vacanță 🏝️",
        "Rust e cel mai tare limbaj! 🦀",
        "Dark mode > Light mode 🌚",
        "Hello World! dar în Rust 👋",
        "Cineva joacă ceva diseară? 🎮",
        "Producti vitatea = 📈",
        "2025 goes hard! 🔥",
        "Learning never stops! 🧠"
    ];

    let comments = vec![
        "Super tare!", "Nice!", "Interesant 🤔", "Subscriu!", 
        "Complet de acord!", "👍👍👍", "Wow!", "Genial!",
        "Same here! 😄", "Facts! 💯", "Relatable", "Goals! 🎯"
    ];

    // Create users
    let password_hash = hash("password123", DEFAULT_COST)?;
    let mut user_ids: Vec<String> = Vec::new();

    for username in &usernames {
        let email = format!("{}@example.com", username);
        let bio = format!("Hello! I'm {}", username);
        let id = uuid::Uuid::new_v4().to_string();

        let result = sqlx::query(
            "INSERT INTO users (id, username, email, password_hash, bio) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(username)
        .bind(&email)
        .bind(&password_hash)
        .bind(&bio)
        .execute(&pool)
        .await;

        match result {
            Ok(_) => {
                user_ids.push(id);
                println!("✅ Created user: {}", username);
            },
            Err(e) => println!("⚠️  User {} already exists: {}", username, e),
        }
    }

    if user_ids.is_empty() {
        // If no new users created, get existing users
        let existing = sqlx::query("SELECT id FROM users")
            .fetch_all(&pool)
            .await?;
        
        for row in existing {
            user_ids.push(row.get::<String, _>("id"));
        }
        println!("📝 Using {} existing users", user_ids.len());
    }

    if user_ids.is_empty() {
        println!("❌ No users found in database!");
        return Ok(());
    }

    // Create posts
    let mut post_ids: Vec<String> = Vec::new();
    for _ in 0..30 {
        let user_id = &user_ids[rand::random::<usize>() % user_ids.len()];
        let content = &posts[rand::random::<usize>() % posts.len()];
        let id = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO posts (id, user_id, content) VALUES (?, ?, ?)"
        )
        .bind(&id)
        .bind(user_id)
        .bind(content)
        .execute(&pool)
        .await?;

        post_ids.push(id);
    }
    println!("✅ Created 30 posts");

    // Create comments
    for _ in 0..50 {
        let user_id = &user_ids[rand::random::<usize>() % user_ids.len()];
        let post_id = &post_ids[rand::random::<usize>() % post_ids.len()];
        let content = &comments[rand::random::<usize>() % comments.len()];
        let id = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(post_id)
        .bind(user_id)
        .bind(content)
        .execute(&pool)
        .await?;
    }
    println!("✅ Created 50 comments");

    // Create likes
    for _ in 0..80 {
        let user_id = &user_ids[rand::random::<usize>() % user_ids.len()];
        let post_id = &post_ids[rand::random::<usize>() % post_ids.len()];

        let _ = sqlx::query(
            "INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)"
        )
        .bind(post_id)
        .bind(user_id)
        .execute(&pool)
        .await;
    }
    println!("✅ Created ~80 likes");

    println!("\n🎉 Database seeded successfully!");
    println!("📝 You can now login with any username (password: password123)");
    println!("   Examples: alex_cool, maria_2024, ion_dev");

    Ok(())
}
