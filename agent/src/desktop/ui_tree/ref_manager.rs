use crate::types::{Point, Rect};
use std::collections::HashMap;

/// Manages ref ID → element bounds mapping for click-by-ref
/// Request-scoped: create a new instance for each UI tree read, discard after use
pub struct RefManager {
    refs: HashMap<String, Rect>,
}

impl RefManager {
    pub fn new() -> Self {
        Self {
            refs: HashMap::new(),
        }
    }

    /// Store element bounds under a ref ID
    pub fn register(&mut self, ref_id: String, bounds: Rect) {
        self.refs.insert(ref_id, bounds);
    }

    /// Get the center point (logical coordinates) of an element by ref ID
    pub fn get_element_center(&self, ref_id: &str) -> Option<Point> {
        self.refs
            .get(ref_id)
            .map(|bounds| crate::desktop::coordinate::element_center(bounds))
    }

    /// Check if a ref ID exists
    pub fn contains(&self, ref_id: &str) -> bool {
        self.refs.contains_key(ref_id)
    }

    /// Get bounds for a ref ID
    pub fn get_bounds(&self, ref_id: &str) -> Option<&Rect> {
        self.refs.get(ref_id)
    }

    /// Number of registered elements
    pub fn len(&self) -> usize {
        self.refs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.refs.is_empty()
    }
}

impl Default for RefManager {
    fn default() -> Self {
        Self::new()
    }
}
