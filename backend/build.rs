fn main() {
    // Track added migration files as well as edits to already embedded files.
    println!("cargo:rerun-if-changed=migrations");
}
